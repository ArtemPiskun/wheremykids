import 'package:de_moi_dity/location/fix.dart';
import 'package:de_moi_dity/location/geo_math.dart';
import 'package:de_moi_dity/location/location_filter.dart';
import 'package:de_moi_dity/location/tracking_policy.dart';
import 'package:flutter_test/flutter_test.dart';

const _m = 1 / 111195;
final _t0 = DateTime.utc(2026, 10, 25, 8);
Fix f(double northM, int s, {double acc = 10}) => Fix(lat: 50.45 + northM * _m, lng: 30.52, accuracy: acc, timestamp: _t0.add(Duration(seconds: s)));

void main() {
  test('rejects inaccurate fixes, unless nothing better came for 10 minutes', () {
    final filter = LocationFilter();
    expect(filter.process(f(0, 0), MotionState.moving).isAccepted, isTrue);
    expect(filter.process(f(10, 30, acc: 400), MotionState.moving).reason, RejectReason.inaccurate);
    final late = filter.process(f(10, 11 * 60, acc: 400), MotionState.moving);
    expect(late.isAccepted, isTrue);
    expect(late.fix!.coarse, isTrue);
  });

  test('rejects out-of-order and teleporting fixes', () {
    final filter = LocationFilter()..process(f(0, 60), MotionState.moving);
    expect(filter.process(f(10, 30), MotionState.moving).reason, RejectReason.outOfOrder);
    expect(filter.process(f(20000, 70), MotionState.moving).reason, RejectReason.teleport);
  });

  test('de-duplicates small moves while stationary', () {
    final filter = LocationFilter()..process(f(0, 0), MotionState.stationary);
    expect(filter.process(f(12, 300), MotionState.stationary).reason, RejectReason.duplicate);
    expect(filter.process(f(80, 600), MotionState.stationary).isAccepted, isTrue);
  });

  test('Kalman smoothing pulls a noisy fix toward the track and shrinks its error', () {
    final filter = LocationFilter();
    filter.process(f(0, 0, acc: 10), MotionState.moving);
    filter.process(f(10, 10, acc: 10), MotionState.moving);
    final noisy = filter.process(f(80, 20, acc: 60), MotionState.moving).fix!;
    final raw = f(80, 20);
    expect(distanceMeters(50.45, 30.52, noisy.lat, noisy.lng), lessThan(distanceMeters(50.45, 30.52, raw.lat, raw.lng)));
    expect(noisy.accuracy, lessThan(60));
  });
}
