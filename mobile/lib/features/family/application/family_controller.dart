import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/realtime/events.dart';
import '../../../core/realtime/realtime_client.dart';
import '../data/family_repository.dart';
import '../data/models.dart';

class FamilyState {
  const FamilyState({required this.family, required this.children, required this.live, required this.syncedAt});

  final FamilyDetails family;
  final List<ChildSummary> children;

  /// Socket connected: what is on screen is current.
  final bool live;

  /// When data was last confirmed by the server; shown when [live] is false.
  final DateTime syncedAt;

  FamilyState copyWith({List<ChildSummary>? children, bool? live, DateTime? syncedAt}) =>
      FamilyState(family: family, children: children ?? this.children, live: live ?? this.live, syncedAt: syncedAt ?? this.syncedAt);
}

/// The parent's family with live child positions: REST snapshot + realtime events.
/// `null` means the parent has no family yet (onboarding).
class FamilyController extends AsyncNotifier<FamilyState?> {
  final _subs = <StreamSubscription<Object?>>[];

  FamilyRepository get _repo => ref.read(familyRepositoryProvider);

  @override
  Future<FamilyState?> build() async {
    ref.watch(sessionProvider);
    ref.onDispose(() {
      for (final s in _subs) {
        unawaited(s.cancel());
      }
      _subs.clear();
    });
    final families = await _repo.myFamilies();
    if (families.isEmpty) return null;
    final state = await _load(families.first['id'] as String);
    _listen();
    return state;
  }

  Future<void> createFamily(String name) async {
    final family = await _repo.create(name);
    state = AsyncData(FamilyState(family: family, children: family.children, live: true, syncedAt: DateTime.now()));
    _listen();
  }

  Future<void> refresh() async {
    final current = state.valueOrNull;
    if (current == null) return ref.invalidateSelf();
    try {
      state = AsyncData(await _load(current.family.id));
    } catch (_) {
      // Keep showing cached data; the banner already says it is stale.
      state = AsyncData(current.copyWith(live: false));
    }
  }

  Future<FamilyState> _load(String familyId) async {
    final results = await Future.wait([_repo.get(familyId), _repo.latest(familyId)]);
    final family = results[0] as FamilyDetails;
    final latest = results[1] as Map<String, ChildSummaryPatch>;
    final children = [
      for (final c in family.children)
        if (latest[c.id] case final p?)
          c.copyWith(status: p.status, lastSeenAt: p.lastSeenAt, battery: p.battery, charging: p.charging, location: p.location, sharingPausedUntil: p.sharingPausedUntil, clearPause: p.sharingPausedUntil == null)
        else
          c,
    ];
    final rt = ref.read(realtimeProvider);
    return FamilyState(family: family, children: children, live: rt.state == RtConnection.connected, syncedAt: DateTime.now());
  }

  void _listen() {
    if (_subs.isNotEmpty) return;
    final rt = ref.read(realtimeProvider);
    _subs
      ..add(rt.events.listen(_onEvent))
      ..add(rt.connection.listen((c) {
        final s = state.valueOrNull;
        if (s == null) return;
        if (c == RtConnection.connected) {
          // Catch up on anything missed while disconnected.
          unawaited(refresh());
        } else {
          state = AsyncData(s.copyWith(live: false));
        }
      }));
  }

  void _onEvent(RtEvent e) {
    final s = state.valueOrNull;
    if (s == null) return;
    switch (e.name) {
      case RtEvents.locationUpdated:
        _patch(e.data['childId'] as String, (c) {
          final loc = ChildLocation.fromJson(e.data);
          return c.copyWith(location: loc, battery: loc.battery ?? c.battery, status: ChildStatus.online, lastSeenAt: DateTime.now(), connected: true);
        });
      case RtEvents.childPresence:
        _patch(e.data['childId'] as String, (c) => c.copyWith(
              status: ChildStatus.values.asNameMap()[e.data['status']] ?? c.status,
              lastSeenAt: DateTime.tryParse(e.data['lastSeenAt'] as String? ?? ''),
              battery: (e.data['battery'] as num?)?.toInt(),
              charging: e.data['charging'] as bool?,
              connected: true,
            ));
      case RtEvents.sharingChanged:
        final paused = e.data['paused'] == true;
        _patch(e.data['childId'] as String, (c) => c.copyWith(
              status: paused ? ChildStatus.paused : ChildStatus.online,
              sharingPausedUntil: paused ? DateTime.tryParse(e.data['until'] as String? ?? '') : null,
              clearPause: !paused,
            ));
      case RtEvents.childJoined || RtEvents.childLeft:
        unawaited(refresh());
    }
  }

  void _patch(String childId, ChildSummary Function(ChildSummary) update) {
    final s = state.valueOrNull;
    if (s == null) return;
    state = AsyncData(s.copyWith(
      children: [for (final c in s.children) c.id == childId ? update(c) : c],
      live: true,
      syncedAt: DateTime.now(),
    ));
  }
}

final familyControllerProvider = AsyncNotifierProvider<FamilyController, FamilyState?>(FamilyController.new);
