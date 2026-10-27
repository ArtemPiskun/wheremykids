import 'dart:async';

import 'package:flutter/foundation.dart';

import 'fix.dart';
import 'location_engine.dart';
import 'location_filter.dart';
import 'location_queue.dart';
import 'motion_detector.dart';
import 'sync_service.dart';
import 'tracking_policy.dart';

typedef PowerReader = Future<PowerState> Function();
typedef Heartbeat = Future<void> Function(PowerState power);

class TrackingSnapshot {
  const TrackingSnapshot({required this.running, required this.motion, required this.params, required this.lastFix, required this.power});
  final bool running;
  final MotionState motion;
  final TrackingParams params;
  final Fix? lastFix;
  final PowerState power;
}

/// Orchestrates the child's tracking loop:
/// OS fix → noise filter → motion detector → adaptive params → queue → upload.
class TrackingService {
  TrackingService({
    required this.engine,
    required this.queue,
    required this.sync,
    required this.readPower,
    required this.heartbeat,
    LocationFilter? filter,
    MotionDetector? detector,
  })  : _filter = filter ?? LocationFilter(),
        _detector = detector ?? MotionDetector();

  static const sosBurst = Duration(minutes: 15);
  static const requestBurst = Duration(minutes: 2);

  final LocationEngine engine;
  final LocationQueue queue;
  final SyncService sync;
  final PowerReader readPower;
  final Heartbeat heartbeat;
  final LocationFilter _filter;
  final MotionDetector _detector;

  final _snapshots = StreamController<TrackingSnapshot>.broadcast();
  StreamSubscription<Fix>? _fixSub;
  Timer? _heartbeatTimer;
  Timer? _burstTimer;
  PowerState _power = PowerState.unknown;
  DateTime _powerReadAt = DateTime.fromMillisecondsSinceEpoch(0);
  TrackingParams _params = paramsFor(MotionState.stationary, PowerState.unknown);
  bool _running = false;

  Stream<TrackingSnapshot> get snapshots => _snapshots.stream;
  bool get running => _running;

  Future<void> start() async {
    if (_running) return;
    _running = true;
    _power = await readPower();
    _fixSub = engine.fixes.listen(_onFix, onError: (Object e) => debugPrint('Location stream error: $e'));
    await _apply();
    // An immediate fix so parents see the child right after connecting or reboot.
    unawaited(_captureNow(FixSource.fused));
  }

  Future<void> stop() async {
    _running = false;
    await _fixSub?.cancel();
    _fixSub = null;
    _heartbeatTimer?.cancel();
    _burstTimer?.cancel();
    await engine.stop();
    _emit();
  }

  /// SOS: full power for 15 minutes; the caller sends the SOS itself.
  Future<Fix?> startSosBurst() => _burst(sosBurst, FixSource.sos);

  /// A parent tapped "update now".
  Future<Fix?> answerLocationRequest() => _burst(requestBurst, FixSource.fused);

  /// "Send my location" from the child's own screen.
  Future<Fix?> shareNow() => _captureNow(FixSource.manual);

  Future<Fix?> _burst(Duration duration, FixSource source) async {
    final until = DateTime.now().add(duration);
    _detector.startBurst(until);
    _burstTimer?.cancel();
    _burstTimer = Timer(duration, () {
      _detector.stopBurst();
      unawaited(_apply());
    });
    await _apply();
    return _captureNow(source);
  }

  Future<Fix?> _captureNow(FixSource source) async {
    final fix = await engine.currentFix();
    if (fix == null) return null;
    final tagged = fix.copyWith(source: source);
    // Explicit requests bypass the stationary de-duplication: the parent asked for a point.
    await queue.enqueue(tagged, _detector.state);
    await _refreshPower();
    unawaited(sync.flush());
    _emit(lastFix: tagged);
    return tagged;
  }

  Future<void> _onFix(Fix raw) async {
    final result = _filter.process(raw, _detector.state);
    if (!result.isAccepted) return;
    final fix = result.fix!;
    final before = _detector.state;
    final after = _detector.update(fix);
    await queue.enqueue(fix, after);
    await _refreshPower();

    if (before != after) await _apply();
    if (await _shouldUpload()) unawaited(sync.flush());
    _emit(lastFix: fix);
  }

  Future<bool> _shouldUpload() async {
    if (_params.uploadImmediately) return true;
    if (await queue.count() >= _params.uploadBatchSize) return true;
    final oldest = await queue.oldestRecordedAt();
    return oldest != null && DateTime.now().difference(oldest) >= _params.uploadEvery;
  }

  Future<void> _apply() async {
    final next = paramsFor(_detector.state, _power);
    final changed = next != _params;
    _params = next;
    if (_running) await engine.start(next);
    if (changed || _heartbeatTimer == null) {
      _heartbeatTimer?.cancel();
      _heartbeatTimer = Timer.periodic(next.heartbeat, (_) => unawaited(_beat()));
    }
    _emit();
  }

  Future<void> _beat() async {
    await _refreshPower(force: true);
    try {
      await heartbeat(_power);
    } catch (e) {
      debugPrint('Heartbeat failed: $e');
    }
    // Pending points left behind by a failed upload get another chance.
    unawaited(sync.flush());
  }

  Future<void> _refreshPower({bool force = false}) async {
    if (!force && DateTime.now().difference(_powerReadAt) < const Duration(minutes: 1)) return;
    _powerReadAt = DateTime.now();
    final previous = _power;
    _power = await readPower();
    sync
      ..battery = _power.batteryLevel
      ..charging = _power.charging;
    if (previous.low != _power.low || previous.critical != _power.critical || previous.charging != _power.charging) {
      await _apply();
    }
  }

  void _emit({Fix? lastFix}) {
    if (_snapshots.isClosed) return;
    _snapshots.add(TrackingSnapshot(
      running: _running,
      motion: _detector.state,
      params: _params,
      lastFix: lastFix ?? _filter.lastAccepted,
      power: _power,
    ));
  }

  Future<void> dispose() async {
    await stop();
    await _snapshots.close();
  }
}
