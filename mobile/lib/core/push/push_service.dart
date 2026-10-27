import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_client.dart';

/// Android channels; ids must match `channel` in backend/src/modules/notifications/push-driver.ts.
class PushChannels {
  static const sos = AndroidNotificationChannel(
    'sos',
    'SOS',
    description: 'Сигнали тривоги від дітей',
    importance: Importance.max,
    enableVibration: true,
  );
  static const zones = AndroidNotificationChannel('zones', 'Безпечні зони', description: 'Вхід і вихід із зон', importance: Importance.high);
  static const info = AndroidNotificationChannel('info', 'Інформація', description: 'Підключення, пауза та інше', importance: Importance.defaultImportance);
  static const all = [sos, zones, info];
}

/// FCM + local notifications. Push is optional in development: without Firebase config
/// the app still works, realtime updates come over the socket.
class PushService {
  PushService(this.api);

  final ApiClient api;
  final _local = FlutterLocalNotificationsPlugin();
  final _taps = StreamController<Map<String, dynamic>>.broadcast();
  final _data = StreamController<Map<String, dynamic>>.broadcast();
  bool _ready = false;

  /// Notification taps (payload data), e.g. open the SOS screen.
  Stream<Map<String, dynamic>> get taps => _taps.stream;

  /// Data messages received while the app is running (e.g. `location_request`).
  Stream<Map<String, dynamic>> get dataMessages => _data.stream;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Push disabled: Firebase is not configured ($e)');
      return;
    }
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_location'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
      onDidReceiveNotificationResponse: (r) => _taps.add({'type': r.payload ?? ''}),
    );
    final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    for (final c in PushChannels.all) {
      await android?.createNotificationChannel(c);
    }

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, sound: true, badge: true, criticalAlert: true);
    FirebaseMessaging.onMessage.listen(_onForeground);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _taps.add(m.data));
    final initial = await messaging.getInitialMessage();
    if (initial != null) _taps.add(initial.data);
    messaging.onTokenRefresh.listen((t) => unawaited(_register(t)));
    _ready = true;
  }

  /// Call after sign-in so the token is attached to this device on the server.
  Future<void> registerToken() async {
    if (!_ready) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _register(token);
  }

  Future<void> _register(String token) async {
    if (api.session == null) return;
    try {
      await api.put<void>('/v1/devices/current', {'pushToken': token});
    } catch (e) {
      debugPrint('Push token upload failed: $e');
    }
  }

  void _onForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null) {
      _data.add(m.data);
      return;
    }
    final type = m.data['type']?.toString() ?? '';
    final channel = type.startsWith('sos') ? PushChannels.sos : type.startsWith('geofence') ? PushChannels.zones : PushChannels.info;
    unawaited(_local.show(
      m.hashCode,
      n.title,
      n.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          importance: channel.importance,
          priority: type == 'sos' ? Priority.max : Priority.high,
          fullScreenIntent: type == 'sos',
          category: type == 'sos' ? AndroidNotificationCategory.alarm : null,
        ),
        iOS: DarwinNotificationDetails(interruptionLevel: type == 'sos' ? InterruptionLevel.critical : InterruptionLevel.active),
      ),
      payload: type,
    ));
    _data.add(m.data);
  }
}
