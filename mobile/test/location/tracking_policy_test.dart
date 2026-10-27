import 'package:de_moi_dity/location/tracking_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const normal = PowerState(batteryLevel: 80, charging: false);

  test('stationary turns GPS off and only sends heartbeats every 15 minutes', () {
    final p = paramsFor(MotionState.stationary, normal);
    expect(p.accuracy, AccuracyLevel.low);
    expect(p.heartbeat, const Duration(minutes: 15));
  });

  test('moving samples every 30 s / 25 m and uploads every minute', () {
    final p = paramsFor(MotionState.moving, normal);
    expect(p.interval, const Duration(seconds: 30));
    expect(p.distanceFilterM, 25);
    expect(p.uploadEvery, const Duration(minutes: 1));
  });

  test('burst (SOS) ignores battery state and uploads immediately', () {
    final p = paramsFor(MotionState.burst, const PowerState(batteryLevel: 5, charging: false));
    expect(p.accuracy, AccuracyLevel.best);
    expect(p.uploadImmediately, isTrue);
  });

  test('low battery halves the rate and caps accuracy at balanced', () {
    final p = paramsFor(MotionState.moving, const PowerState(batteryLevel: 25, charging: false));
    expect(p.interval, const Duration(seconds: 60));
    expect(p.accuracy, AccuracyLevel.balanced);
  });

  test('power saver mode counts as low battery', () {
    expect(paramsFor(MotionState.moving, const PowerState(batteryLevel: 90, charging: false, powerSaveMode: true)).accuracy, AccuracyLevel.balanced);
  });

  test('blackout mode (<15%) degrades movement to stationary-like heartbeats', () {
    final p = paramsFor(MotionState.vehicle, const PowerState(batteryLevel: 9, charging: false));
    expect(p.accuracy, AccuracyLevel.low);
    expect(p.heartbeat, const Duration(minutes: 10));
  });

  test('charging doubles the rate', () {
    expect(paramsFor(MotionState.moving, const PowerState(batteryLevel: 9, charging: true)).interval, const Duration(seconds: 15));
  });
}
