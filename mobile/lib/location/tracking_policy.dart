/// Decides how hard the device works for location, from motion and power state.
///
/// The goal is a usable route while the child moves and close to zero drain while
/// they sit in class. Values match the table in docs/architecture.html §9.
library;

enum MotionState { stationary, moving, vehicle, burst }

enum AccuracyLevel { low, balanced, high, best }

class PowerState {
  const PowerState({required this.batteryLevel, required this.charging, this.powerSaveMode = false});

  static const unknown = PowerState(batteryLevel: 100, charging: false);

  final int batteryLevel;
  final bool charging;
  final bool powerSaveMode;

  /// "Blackout mode": long power cuts make every percent count.
  bool get critical => !charging && batteryLevel < 15;
  bool get low => !charging && (batteryLevel < 30 || powerSaveMode);
}

class TrackingParams {
  const TrackingParams({
    required this.accuracy,
    required this.distanceFilterM,
    required this.interval,
    required this.uploadEvery,
    required this.uploadBatchSize,
    required this.heartbeat,
  });

  final AccuracyLevel accuracy;
  final int distanceFilterM;

  /// Minimum time between OS fixes.
  final Duration interval;

  /// Flush the queue when the oldest pending point is this old...
  final Duration uploadEvery;

  /// ...or when this many points are pending.
  final int uploadBatchSize;

  /// Presence ping (battery, "online") when nothing else is sent.
  final Duration heartbeat;

  bool get uploadImmediately => uploadEvery == Duration.zero;

  @override
  bool operator ==(Object other) =>
      other is TrackingParams &&
      other.accuracy == accuracy &&
      other.distanceFilterM == distanceFilterM &&
      other.interval == interval &&
      other.uploadEvery == uploadEvery &&
      other.uploadBatchSize == uploadBatchSize &&
      other.heartbeat == heartbeat;

  @override
  int get hashCode => Object.hash(accuracy, distanceFilterM, interval, uploadEvery, uploadBatchSize, heartbeat);

  @override
  String toString() => 'TrackingParams($accuracy, ${distanceFilterM}m, ${interval.inSeconds}s, upload ${uploadEvery.inSeconds}s/$uploadBatchSize, hb ${heartbeat.inMinutes}m)';
}

const _base = <MotionState, TrackingParams>{
  // GPS off: Wi-Fi/cell positioning with a 100 m filter acts as the "stop zone".
  MotionState.stationary: TrackingParams(
    accuracy: AccuracyLevel.low,
    distanceFilterM: 100,
    interval: Duration(minutes: 5),
    uploadEvery: Duration(minutes: 15),
    uploadBatchSize: 20,
    heartbeat: Duration(minutes: 15),
  ),
  MotionState.moving: TrackingParams(
    accuracy: AccuracyLevel.high,
    distanceFilterM: 25,
    interval: Duration(seconds: 30),
    uploadEvery: Duration(seconds: 60),
    uploadBatchSize: 10,
    heartbeat: Duration(minutes: 5),
  ),
  MotionState.vehicle: TrackingParams(
    accuracy: AccuracyLevel.high,
    distanceFilterM: 100,
    interval: Duration(seconds: 20),
    uploadEvery: Duration(seconds: 60),
    uploadBatchSize: 10,
    heartbeat: Duration(minutes: 5),
  ),
  MotionState.burst: TrackingParams(
    accuracy: AccuracyLevel.best,
    distanceFilterM: 0,
    interval: Duration(seconds: 5),
    uploadEvery: Duration.zero,
    uploadBatchSize: 1,
    heartbeat: Duration(minutes: 1),
  ),
};

TrackingParams paramsFor(MotionState motion, PowerState power) {
  final base = _base[motion]!;
  // SOS and parent requests always get full power.
  if (motion == MotionState.burst) return base;

  if (power.critical) {
    final s = _base[MotionState.stationary]!;
    return TrackingParams(
      accuracy: AccuracyLevel.low,
      distanceFilterM: s.distanceFilterM,
      interval: s.interval,
      uploadEvery: const Duration(minutes: 10),
      uploadBatchSize: s.uploadBatchSize,
      heartbeat: const Duration(minutes: 10),
    );
  }
  if (power.charging) {
    return _scale(base, 0.5, base.accuracy);
  }
  if (power.low) {
    final capped = base.accuracy.index > AccuracyLevel.balanced.index ? AccuracyLevel.balanced : base.accuracy;
    return _scale(base, 2, capped);
  }
  return base;
}

TrackingParams _scale(TrackingParams p, double factor, AccuracyLevel accuracy) => TrackingParams(
      accuracy: accuracy,
      distanceFilterM: p.distanceFilterM,
      interval: p.interval * factor,
      uploadEvery: p.uploadEvery * factor,
      uploadBatchSize: p.uploadBatchSize,
      heartbeat: p.heartbeat * factor,
    );
