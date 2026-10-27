import 'dart:async';
import 'dart:io' show Platform;

import 'package:geolocator/geolocator.dart';

import 'fix.dart';
import 'tracking_policy.dart';

enum LocationAccess {
  /// Background ("Allow all the time") granted: full tracking.
  always,

  /// Only while the app is open: tracking stops in the background.
  whileInUse,
  denied,
  deniedForever,
  serviceDisabled,
}

/// Text of the persistent Android notification. Required by the OS for background
/// location, and it is also how the child always knows sharing is on.
class TrackingNotice {
  const TrackingNotice({required this.title, required this.text, required this.channelName});
  final String title;
  final String text;
  final String channelName;
}

/// Platform boundary for positioning. The MVP implementation uses geolocator;
/// a native Kotlin/Swift engine (activity recognition, OS geofences, significant-change
/// relaunch on iOS) can replace it without touching the tracking logic.
abstract class LocationEngine {
  Stream<Fix> get fixes;
  Future<LocationAccess> checkAccess();
  Future<LocationAccess> requestAccess();
  Future<void> start(TrackingParams params);
  Future<void> stop();
  Future<Fix?> currentFix({Duration timeout = const Duration(seconds: 15)});
}

class GeolocatorLocationEngine implements LocationEngine {
  GeolocatorLocationEngine({required this.notice});

  final TrackingNotice notice;
  final _controller = StreamController<Fix>.broadcast();
  StreamSubscription<Position>? _sub;
  TrackingParams? _active;

  @override
  Stream<Fix> get fixes => _controller.stream;

  @override
  Future<LocationAccess> checkAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
    return _map(await Geolocator.checkPermission());
  }

  /// Two steps on purpose: Android 11+ and iOS only offer "always" after "while in use".
  @override
  Future<LocationAccess> requestAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.whileInUse) permission = await Geolocator.requestPermission();
    return _map(permission);
  }

  @override
  Future<void> start(TrackingParams params) async {
    if (_active == params && _sub != null) return;
    await _sub?.cancel();
    _active = params;
    _sub = Geolocator.getPositionStream(locationSettings: _settings(params)).listen(
      (p) => _controller.add(_toFix(p)),
      // Permission revoked or GPS switched off: surface it, the service decides what to do.
      onError: _controller.addError,
    );
  }

  @override
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    _active = null;
  }

  @override
  Future<Fix?> currentFix({Duration timeout = const Duration(seconds: 15)}) async {
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.best, timeLimit: timeout),
      );
      return _toFix(p);
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      return last == null ? null : _toFix(last);
    }
  }

  LocationSettings _settings(TrackingParams params) {
    final accuracy = switch (params.accuracy) {
      AccuracyLevel.low => LocationAccuracy.low,
      AccuracyLevel.balanced => LocationAccuracy.medium,
      AccuracyLevel.high => LocationAccuracy.high,
      AccuracyLevel.best => LocationAccuracy.bestForNavigation,
    };
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: accuracy,
        distanceFilter: params.distanceFilterM,
        intervalDuration: params.interval,
        foregroundNotificationConfig: ForegroundNotificationConfig(
          notificationTitle: notice.title,
          notificationText: notice.text,
          notificationChannelName: notice.channelName,
          notificationIcon: const AndroidResource(name: 'ic_stat_location', defType: 'drawable'),
          enableWakeLock: params.accuracy.index >= AccuracyLevel.high.index,
          setOngoing: true,
        ),
      );
    }
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: accuracy,
        distanceFilter: params.distanceFilterM,
        activityType: ActivityType.otherNavigation,
        pauseLocationUpdatesAutomatically: params.accuracy == AccuracyLevel.low,
        // The blue status-bar pill: iOS's own, honest signal that location is in use.
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }
    return LocationSettings(accuracy: accuracy, distanceFilter: params.distanceFilterM);
  }

  static Fix _toFix(Position p) => Fix(
        lat: p.latitude,
        lng: p.longitude,
        accuracy: p.accuracy,
        timestamp: p.timestamp,
        speed: p.speed >= 0 ? p.speed : null,
        heading: p.heading >= 0 ? p.heading : null,
        altitude: p.altitude,
        source: p.accuracy <= 50 ? FixSource.gps : FixSource.network,
      );

  static LocationAccess _map(LocationPermission p) => switch (p) {
        LocationPermission.always => LocationAccess.always,
        LocationPermission.whileInUse => LocationAccess.whileInUse,
        LocationPermission.deniedForever => LocationAccess.deniedForever,
        LocationPermission.denied || LocationPermission.unableToDetermine => LocationAccess.denied,
      };
}
