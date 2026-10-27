import 'dart:math' as math;

import 'fix.dart';
import 'geo_math.dart';
import 'tracking_policy.dart';

enum RejectReason { inaccurate, outOfOrder, teleport, duplicate }

class FilterResult {
  const FilterResult.accepted(Fix this.fix) : reason = null;
  const FilterResult.rejected(RejectReason this.reason) : fix = null;

  final Fix? fix;
  final RejectReason? reason;

  bool get isAccepted => fix != null;
}

/// Drops GPS noise before it reaches the queue, and smooths what is left.
class LocationFilter {
  LocationFilter({this.maxAccuracyM = 150, this.coarseAfter = const Duration(minutes: 10)});

  final double maxAccuracyM;

  /// If nothing accurate arrived for this long, a vague fix beats no fix at all.
  final Duration coarseAfter;

  static const _teleportSpeed = 70.0; // m/s, ~250 km/h
  static const _minStationaryMoveM = 30.0;

  Fix? _lastAccepted;
  final _kalman = _KalmanLatLng();

  Fix? get lastAccepted => _lastAccepted;

  FilterResult process(Fix raw, MotionState motion) {
    final last = _lastAccepted;
    if (last != null && !raw.timestamp.isAfter(last.timestamp)) {
      return const FilterResult.rejected(RejectReason.outOfOrder);
    }

    var coarse = false;
    if (raw.accuracy > maxAccuracyM) {
      final starving = last == null || raw.timestamp.difference(last.timestamp) >= coarseAfter;
      if (!starving) return const FilterResult.rejected(RejectReason.inaccurate);
      coarse = true;
    }

    if (last != null) {
      final dist = distanceMeters(last.lat, last.lng, raw.lat, raw.lng);
      final seconds = math.max(1, raw.timestamp.difference(last.timestamp).inSeconds);
      // A jump only counts as real if it is far beyond both fixes' error circles.
      final plausible = (dist - raw.accuracy - last.accuracy) / seconds <= _teleportSpeed;
      if (!plausible) return const FilterResult.rejected(RejectReason.teleport);

      if (motion == MotionState.stationary) {
        if (dist < math.max(raw.accuracy, _minStationaryMoveM)) {
          return const FilterResult.rejected(RejectReason.duplicate);
        }
      }
    }

    final smoothed = motion == MotionState.burst || coarse ? raw : _kalman.process(raw);
    final accepted = smoothed.copyWith(coarse: coarse);
    _lastAccepted = accepted;
    return FilterResult.accepted(accepted);
  }

  void reset() {
    _lastAccepted = null;
    _kalman.reset();
  }
}

/// Minimal Kalman filter on lat/lng with variance in m², after the classic
/// "KalmanLatLong" approach: measurement noise = accuracy², process noise grows with speed.
class _KalmanLatLng {
  double? _lat;
  double? _lng;
  double _variance = -1;
  DateTime? _time;

  Fix process(Fix fix) {
    final accuracy = math.max(fix.accuracy, 1.0);
    if (_variance < 0 || _lat == null) {
      _lat = fix.lat;
      _lng = fix.lng;
      _variance = accuracy * accuracy;
      _time = fix.timestamp;
      return fix;
    }
    final dtSeconds = fix.timestamp.difference(_time!).inMilliseconds / 1000.0;
    if (dtSeconds > 0) {
      final q = math.max(fix.speed ?? 0, 3.0);
      _variance += dtSeconds * q * q;
      _time = fix.timestamp;
    }
    final gain = _variance / (_variance + accuracy * accuracy);
    _lat = _lat! + gain * (fix.lat - _lat!);
    _lng = _lng! + gain * (fix.lng - _lng!);
    _variance = (1 - gain) * _variance;
    return fix.copyWith(lat: _lat, lng: _lng, accuracy: math.sqrt(_variance));
  }

  void reset() {
    _lat = null;
    _lng = null;
    _variance = -1;
    _time = null;
  }
}
