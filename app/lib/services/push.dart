import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api.dart';

final _local = FlutterLocalNotificationsPlugin();

const _alertsChannel = AndroidNotificationChannel(
  'alerts', 'Тривоги та SOS',
  description: 'Повітряні тривоги, SOS, дитина в зоні тривоги',
  importance: Importance.max,
);
const _defaultChannel = AndroidNotificationChannel(
  'default', 'Події',
  description: 'Геозони, заряд, «Я в укритті»',
  importance: Importance.high,
);
// Гучний сигнал звучить як будильник, тобто й у беззвучному режимі
const _ringChannel = AndroidNotificationChannel(
  'ring', 'Гучний сигнал від батьків',
  importance: Importance.max,
  audioAttributesUsage: AudioAttributesUsage.alarm,
);

Future<void> _initLocal() async {
  await _local.initialize(
    settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
  );
  final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  for (final ch in [_alertsChannel, _defaultChannel, _ringChannel]) {
    await android?.createNotificationChannel(ch);
  }
}

Future<void> _show(RemoteMessage m) async {
  final type = m.data['type'];
  if (type == 'ring') {
    await _local.show(
      id: 7,
      title: 'Батьки шукають тебе',
      body: 'Відгукнися або передзвони батькам',
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(_ringChannel.id, _ringChannel.name,
            importance: Importance.max, priority: Priority.max, fullScreenIntent: true,
            audioAttributesUsage: AudioAttributesUsage.alarm),
      ),
    );
    return;
  }
  final n = m.notification;
  if (n == null) return;
  final ch = n.android?.channelId == 'alerts' ? _alertsChannel : _defaultChannel;
  await _local.show(
    id: m.hashCode,
    title: n.title,
    body: n.body,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(ch.id, ch.name, importance: ch.importance, priority: Priority.high),
    ),
  );
}

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage m) async {
  // Повідомлення з notification система показує сама; тут — лише «тихі» команди
  if (m.data['type'] != 'ring') return;
  await Firebase.initializeApp();
  await _initLocal();
  await _show(m);
}

/// Підключає пуші й передає FCM-токен серверу.
/// Без google-services.json Firebase не ініціалізується — тоді застосунок
/// працює без пушів (зручно для першого запуску).
class Push {
  static bool available = false;

  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      await _initLocal();
      FirebaseMessaging.onMessage.listen(_show);
      available = true;
    } catch (e) {
      debugPrint('Firebase недоступний: $e');
    }
  }

  static Future<void> register(Api api) async {
    if (!available) return;
    await FirebaseMessaging.instance.requestPermission();
    // Класичний FCM-токен: сервер шле через firebase-admin sendEachForMulticast.
    // Перехід на register()/onRegistered (FID) — коли його підтримає firebase-admin.
    // ignore: deprecated_member_use
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await api.setPushToken(token);
    // ignore: deprecated_member_use
    FirebaseMessaging.instance.onTokenRefresh.listen((t) => api.setPushToken(t));
  }
}
