import 'dart:async';
import 'dart:convert';

import 'package:battery_plus/battery_plus.dart';
import 'package:geolocator/geolocator.dart';

import 'api.dart';
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
    last = p;
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
