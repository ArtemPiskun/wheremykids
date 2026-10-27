import 'dart:async';
import 'dart:ui' show PlatformDispatcher;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart' show basicLocaleListResolution;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/realtime/events.dart';
import '../../../core/realtime/realtime_client.dart';
import '../../../l10n/app_localizations.dart';
import '../../../location/fix.dart';
import '../../../location/location_engine.dart';
import '../../../location/location_queue.dart';
import '../../../location/sync_service.dart';
import '../../../location/tracking_service.dart';
import '../../auth/application/auth_controller.dart';
import '../data/child_repository.dart';

enum SosPhase { idle, sending, sent, acknowledged, failed }

class ChildSos {
  const ChildSos({required this.clientId, required this.phase, this.id, this.ackBy, this.fix});
  final String clientId;
  final SosPhase phase;
  final String? id;
  final String? ackBy;
  final Fix? fix;

  ChildSos copyWith({SosPhase? phase, String? id, String? ackBy}) =>
      ChildSos(clientId: clientId, phase: phase ?? this.phase, id: id ?? this.id, ackBy: ackBy ?? this.ackBy, fix: fix);
}

class ChildState {
  const ChildState({
    required this.profile,
    required this.access,
    required this.connected,
    required this.pending,
    this.tracking,
    this.sos,
    this.lastShared,
  });

  final ChildProfile profile;
  final LocationAccess access;
  final bool connected;
  final int pending;
  final TrackingSnapshot? tracking;
  final ChildSos? sos;
  final DateTime? lastShared;

  ChildState copyWith({
    ChildProfile? profile,
    LocationAccess? access,
    bool? connected,
    int? pending,
    TrackingSnapshot? tracking,
    ChildSos? sos,
    bool clearSos = false,
    DateTime? lastShared,
  }) =>
      ChildState(
        profile: profile ?? this.profile,
        access: access ?? this.access,
        connected: connected ?? this.connected,
        pending: pending ?? this.pending,
        tracking: tracking ?? this.tracking,
        sos: clearSos ? null : sos ?? this.sos,
        lastShared: lastShared ?? this.lastShared,
      );
}

/// Runs the child device: tracking loop, uploads, presence, SOS and sharing rules.
class ChildController extends AsyncNotifier<ChildState> {
  static const _uuid = Uuid();
  static const sosHttpTimeout = Duration(seconds: 15);

  TrackingService? _tracking;
  SyncService? _sync;
  LocationQueue? _queue;
  final _subs = <StreamSubscription<Object?>>[];

  ChildRepository get _repo => ref.read(childRepositoryProvider);

  @override
  Future<ChildState> build() async {
    ref.onDispose(_dispose);
    final s = lookupS(basicLocaleListResolution(PlatformDispatcher.instance.locales, S.supportedLocales));
    final engine = GeolocatorLocationEngine(
      notice: TrackingNotice(title: s.trackingNoticeTitle, text: s.trackingNoticeText, channelName: s.trackingChannel),
    );
    final rt = ref.read(realtimeProvider);
    _queue = await LocationQueue.open();
    _sync = SyncService(queue: _queue!, upload: _repo.uploadBatch);
    _tracking = TrackingService(
      engine: engine,
      queue: _queue!,
      sync: _sync!,
      readPower: readPowerState,
      heartbeat: (power) async {
        if (rt.state == RtConnection.connected) {
          rt.ping(battery: power.batteryLevel, charging: power.charging);
        } else {
          await _repo.heartbeat(battery: power.batteryLevel, charging: power.charging);
        }
      },
    );

    final profile = await _repo.me();
    final access = await engine.checkAccess();
    _subs
      ..add(_tracking!.snapshots.listen((t) => _update((s) => s.copyWith(tracking: t))))
      ..add(_sync!.status.listen((st) => _update((s) => s.copyWith(pending: st.pending))))
      ..add(rt.connection.listen((c) {
        _update((s) => s.copyWith(connected: c == RtConnection.connected));
        if (c == RtConnection.connected) unawaited(_sync?.kick());
      }))
      ..add(rt.events.listen(_onEvent))
      // Network is back: upload the queued points now instead of waiting out the backoff (up to 5 min).
      ..add(Connectivity().onConnectivityChanged.listen((r) {
        if (r.any((c) => c != ConnectivityResult.none)) unawaited(_sync?.kick());
      }))
      ..add(ref.read(pushServiceProvider).dataMessages.listen((m) {
        if (m['type'] == 'location_request') unawaited(_tracking?.answerLocationRequest());
      }));

    if (_canTrack(access) && !profile.paused) await _tracking!.start();
    return ChildState(profile: profile, access: access, connected: rt.state == RtConnection.connected, pending: await _queue!.count());
  }

  bool _canTrack(LocationAccess a) => a == LocationAccess.always || a == LocationAccess.whileInUse;

  Future<LocationAccess> requestPermission() async {
    final engine = _tracking!.engine;
    final access = await engine.requestAccess();
    _update((s) => s.copyWith(access: access));
    final profile = state.valueOrNull?.profile;
    if (_canTrack(access) && profile != null && !profile.paused) await _tracking!.start();
    return access;
  }

  Future<void> onAppResumed() async {
    final access = await _tracking?.engine.checkAccess();
    if (access != null) _update((s) => s.copyWith(access: access));
    unawaited(_sync?.kick());
  }

  Future<void> shareNow() async {
    final fix = await _tracking?.shareNow();
    if (fix != null) _update((s) => s.copyWith(lastShared: DateTime.now()));
  }

  /// Called after the hold-and-countdown on the SOS button has completed.
  Future<void> raiseSos() async {
    final current = state.valueOrNull?.sos;
    final clientId = current != null && current.phase != SosPhase.idle ? current.clientId : _uuid.v4();
    _update((s) => s.copyWith(sos: ChildSos(clientId: clientId, phase: SosPhase.sending)));

    final fix = await _tracking?.startSosBurst().timeout(const Duration(seconds: 10), onTimeout: () => null);
    final power = await readPowerState();
    _update((s) => s.copyWith(sos: ChildSos(clientId: clientId, phase: SosPhase.sending, fix: fix)));
    try {
      final res = await _repo
          .raiseSos(clientId: clientId, lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, battery: power.batteryLevel)
          .timeout(sosHttpTimeout);
      _update((s) => s.copyWith(sos: s.sos?.copyWith(phase: SosPhase.sent, id: res['id'] as String)));
    } catch (_) {
      // Offer the SMS fallback and keep retrying with the same clientId (server is idempotent).
      _update((s) => s.copyWith(sos: s.sos?.copyWith(phase: SosPhase.failed)));
      unawaited(_retrySos(clientId, fix, power.batteryLevel));
    }
  }

  Future<void> _retrySos(String clientId, Fix? fix, int battery) async {
    for (var attempt = 0; attempt < 30; attempt++) {
      await Future<void>.delayed(Duration(seconds: 5 + attempt * 5));
      final sos = state.valueOrNull?.sos;
      if (sos == null || sos.clientId != clientId || sos.phase != SosPhase.failed) return;
      try {
        final res = await _repo.raiseSos(clientId: clientId, lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, battery: battery);
        _update((s) => s.copyWith(sos: s.sos?.copyWith(phase: SosPhase.sent, id: res['id'] as String)));
        return;
      } catch (_) {}
    }
  }

  Future<void> cancelSos() async {
    final sos = state.valueOrNull?.sos;
    _update((s) => s.copyWith(clearSos: true));
    if (sos?.id != null) await _repo.cancelSos(sos!.id!);
  }

  Future<void> pause() async {
    final profile = await _repo.pause(60);
    await _tracking?.stop();
    _update((s) => s.copyWith(profile: profile));
  }

  Future<void> resume() async {
    final profile = await _repo.resume();
    _update((s) => s.copyWith(profile: profile));
    if (_canTrack(state.valueOrNull?.access ?? LocationAccess.denied)) await _tracking?.start();
  }

  Future<void> leave() async {
    await _repo.leave();
    await _tracking?.stop();
    await _queue?.clear();
    await ref.read(authControllerProvider).forget();
  }

  void _onEvent(RtEvent e) {
    switch (e.name) {
      case RtEvents.locationRequest:
        unawaited(_tracking?.answerLocationRequest());
      case RtEvents.sosUpdated:
        final status = e.data['status'] as String?;
        _update((s) {
          final sos = s.sos;
          if (sos == null || (sos.id != null && sos.id != e.data['id'])) return s;
          if (status == 'resolved' || status == 'cancelled') return s.copyWith(clearSos: true);
          if (status == 'acknowledged') {
            return s.copyWith(sos: sos.copyWith(phase: SosPhase.acknowledged, ackBy: e.data['acknowledgedByName'] as String?));
          }
          return s;
        });
      case RtEvents.deviceRevoked:
        unawaited(ref.read(authControllerProvider).forget());
    }
  }

  void _update(ChildState Function(ChildState) f) {
    final s = state.valueOrNull;
    if (s != null) state = AsyncData(f(s));
  }

  Future<void> _dispose() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    await _tracking?.dispose();
    await _sync?.dispose();
    await _queue?.close();
  }
}

final childControllerProvider = AsyncNotifierProvider<ChildController, ChildState>(ChildController.new);
