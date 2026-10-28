import 'dart:async';
import 'dart:convert';

import 'package:battery_plus/battery_plus.dart';
import 'package:geolocator/geolocator.dart';

import 'api.dart';
import 'plausibility.dart';
import 'storage.dart';

/// Фонове відстеження на телефоні дитини.
/// Працює як foreground service з постійним сповіщенням — так вимагає
/// Android, і так дитина завжди бачить, що її місцезнаходження передається.
class LocationTracker {
  LocationTracker(this.api, this.storage);
  final Api api;
  final Storage storage;
  final _battery = Battery();
  StreamSubscription<Position>? _sub;
  Position? last;
  Fix? _lastGood;

  static const _maxBuffered = 2000;

  /// Повертає текст помилки або null, якщо відстеження запущено.
  Future<String?> start() async {
    if (!await Geolocator.isLocationServiceEnabled()) return 'Увімкни геолокацію в налаштуваннях телефону';
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      return 'Без доступу до геолокації батьки не бачитимуть, де ти';
    }
    // Для роботи у фоні потрібен дозвіл «Дозволяти завжди»
    if (perm == LocationPermission.whileInUse) perm = await Geolocator.requestPermission();

    final settings = AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 100,
      intervalDuration: const Duration(minutes: 3),
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'Мої діти',
        notificationText: 'Батьки бачать, де ти зараз',
        enableWakeLock: true,
        setOngoing: true,
      ),
    );
    await _sub?.cancel();
    _sub = Geolocator.getPositionStream(locationSettings: settings).listen(_onPosition);
    return null;
  }

  Future<void> stop() async => _sub?.cancel();

  Future<void> _onPosition(Position p) async {
    final fix = Fix(p.latitude, p.longitude, p.accuracy, p.timestamp, mocked: p.isMocked);
    if (!looksSpoofed(fix, _lastGood)) {
      last = p;
      _lastGood = fix;
      await _record(p, 'fused');
      return;
    }
    // GPS глушать або підміняють: надсилаємо цю точку з позначкою (сервер її відкине,
    // а батьки побачать «GPS ненадійний») і пробуємо координати з вишок і Wi-Fi,
    // яких РЕБ не торкається
    await _record(p, 'gps');
    final net = await _networkFix();
    if (net != null && !looksSpoofed(Fix(net.latitude, net.longitude, net.accuracy, net.timestamp, mocked: net.isMocked), _lastGood)) {
      last = net;
      _lastGood = Fix(net.latitude, net.longitude, net.accuracy, net.timestamp);
      await _record(net, 'network');
    }
  }

  /// Місце за мережею: LocationManager з низькою точністю бере NETWORK_PROVIDER
  /// (вишки + Wi-Fi) замість супутників.
  Future<Position?> _networkFix() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.low,
          forceLocationManager: true,
          timeLimit: const Duration(seconds: 20),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _record(Position p, String source) async {
    int? battery;
    try {
      battery = await _battery.batteryLevel;
    } catch (_) {}
    final point = {
      'lat': p.latitude,
      'lon': p.longitude,
      'accuracy': p.accuracy,
      'battery': ?battery,
      'recordedAt': p.timestamp.toUtc().toIso8601String(),
      'source': source,
      'mocked': p.isMocked,
    };
    final pending = [...storage.pendingPoints, jsonEncode(point)];
    // Під час довгого блекауту зберігаємо лише найновіші точки
    final trimmed = pending.length > _maxBuffered ? pending.sublist(pending.length - _maxBuffered) : pending;
    await storage.setPendingPoints(trimmed);
    await flush();
  }

  /// Надсилає накопичені точки пачками; при помилці мережі вони лишаються в буфері.
  Future<void> flush() async {
    var pending = storage.pendingPoints;
    while (pending.isNotEmpty) {
      final batch = pending.take(500).toList();
      try {
        await api.sendPoints(batch.map((s) => jsonDecode(s) as Map<String, dynamic>).toList());
      } catch (_) {
        return;
      }
      pending = pending.sublist(batch.length);
      await storage.setPendingPoints(pending);
    }
  }
}
