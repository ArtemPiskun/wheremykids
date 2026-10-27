import 'package:de_moi_dity/location/fix.dart';
import 'package:de_moi_dity/location/motion_detector.dart';
import 'package:de_moi_dity/location/tracking_policy.dart';
import 'package:flutter_test/flutter_test.dart';

const _m = 1 / 111195; // degrees of latitude per metre
final _t0 = DateTime.utc(2026, 10, 25, 8);

Fix fixAt(double northM, int seconds, {double? speed, double accuracy = 10}) =>
    Fix(lat: 50.45 + northM * _m, lng: 30.52, accuracy: accuracy, timestamp: _t0.add(Duration(seconds: seconds)), speed: speed);

void main() {
  test('stays stationary on jitter inside the stop zone', () {
    final d = MotionDetector();
    for (var i = 0; i < 20; i++) {
      expect(d.update(fixAt(i.isEven ? 15 : -15, i * 60, speed: 0.2)), MotionState.stationary);
    }
  });

  test('leaving the 120 m stop zone switches to moving', () {
    final d = MotionDetector()..update(fixAt(0, 0));
    expect(d.update(fixAt(200, 120, speed: 1.4)), MotionState.moving);
  });

  test('sustained speed above 7 m/s switches to vehicle, and back after a minute of slow speed', () {
    final d = MotionDetector(initial: MotionState.moving);
    for (var i = 0; i < 4; i++) {
      d.update(fixAt(i * 200.0, i * 20, speed: 11));
    }
    expect(d.state, MotionState.vehicle);
    // The median speed needs a few slow fixes to drop, then 60 s of slow movement.
    for (var i = 0; i < 8; i++) {
      d.update(fixAt(800 + i * 30.0, 100 + i * 20, speed: 1.2));
    }
    expect(d.state, MotionState.moving);
  });

  test('three still minutes within 40 m make a walking child stationary', () {
    final d = MotionDetector(initial: MotionState.moving);
    for (var i = 0; i <= 6; i++) {
      d.update(fixAt(i.isEven ? 5 : -5, i * 30, speed: 0.1));
    }
    expect(d.state, MotionState.stationary);
  });

  test('burst wins until it expires, then the previous state returns', () {
    final d = MotionDetector(initial: MotionState.moving)..startBurst(_t0.add(const Duration(minutes: 15)));
    expect(d.update(fixAt(0, 60)), MotionState.burst);
    expect(d.update(fixAt(0, 16 * 60)), MotionState.moving);
  });
}
