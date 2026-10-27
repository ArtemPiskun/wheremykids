import 'fix.dart';
import 'geo_math.dart';
import 'tracking_policy.dart';

/// Classifies movement from accepted fixes. Pure and clock-free: time comes from the fixes,
/// so it is fully testable and replays the same way on every device.
class MotionDetector {
  MotionDetector({MotionState initial = MotionState.stationary}) : _state = initial;

  static const stopZoneRadiusM = 120.0;
  static const stillRadiusM = 40.0;
  static const stillWindow = Duration(minutes: 3);
  static const walkingSpeed = 1.0;
  static const vehicleSpeed = 7.0;
  static const vehicleExitSpeed = 4.0;
  static const vehicleExitWindow = Duration(seconds: 60);

  MotionState _state;
  Fix? _anchor;
  final List<Fix> _window = [];
  DateTime? _burstUntil;
  MotionState _beforeBurst = MotionState.moving;
  DateTime? _slowSince;

  MotionState get state => _state;

  /// SOS or a parent request: maximum effort until [until].
  void startBurst(DateTime until) {
    if (_state != MotionState.burst) _beforeBurst = _state;
    _burstUntil = until;
    _state = MotionState.burst;
  }

  void stopBurst() {
    _burstUntil = null;
    if (_state == MotionState.burst) _state = _beforeBurst;
  }

  MotionState update(Fix fix) {
    _window.add(fix);
    _window.removeWhere((f) => fix.timestamp.difference(f.timestamp) > const Duration(minutes: 5));
    _anchor ??= fix;

    if (_state == MotionState.burst) {
      if (_burstUntil != null && !fix.timestamp.isBefore(_burstUntil!)) {
        stopBurst();
      } else {
        return _state;
      }
    }

    final speeds = _window.reversed.take(5).map((f) => f.speed).whereType<double>().where((s) => s >= 0).toList();
    final medianSpeed = median(speeds);

    switch (_state) {
      case MotionState.stationary:
        final left = distanceMeters(_anchor!.lat, _anchor!.lng, fix.lat, fix.lng) > stopZoneRadiusM + fix.accuracy * 0.5;
        if (left || (speeds.length >= 2 && medianSpeed > walkingSpeed)) {
          _state = medianSpeed > vehicleSpeed ? MotionState.vehicle : MotionState.moving;
          _anchor = fix;
        }
      case MotionState.moving:
        if (speeds.length >= 3 && medianSpeed > vehicleSpeed) {
          _state = MotionState.vehicle;
          _slowSince = null;
        } else if (_isStill(fix)) {
          _state = MotionState.stationary;
          _anchor = fix;
        }
      case MotionState.vehicle:
        if (medianSpeed < vehicleExitSpeed) {
          _slowSince ??= fix.timestamp;
          if (fix.timestamp.difference(_slowSince!) >= vehicleExitWindow) {
            _state = MotionState.moving;
            _slowSince = null;
          }
        } else {
          _slowSince = null;
        }
      case MotionState.burst:
        break;
    }
    return _state;
  }

  /// Still = every fix of the last 3 minutes lies within 40 m of their centroid.
  bool _isStill(Fix latest) {
    final recent = _window.where((f) => latest.timestamp.difference(f.timestamp) <= stillWindow).toList();
    if (recent.length < 3) return false;
    if (latest.timestamp.difference(recent.first.timestamp) < stillWindow * 0.9) return false;
    final lat = recent.map((f) => f.lat).reduce((a, b) => a + b) / recent.length;
    final lng = recent.map((f) => f.lng).reduce((a, b) => a + b) / recent.length;
    return recent.every((f) => distanceMeters(lat, lng, f.lat, f.lng) <= stillRadiusM);
  }
}
