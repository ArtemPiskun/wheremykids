import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

class Oblast {
  Oblast(this.uid, this.title);
  final int uid;
  final String title;
}

class Child {
  Child.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        name = j['name'],
        lat = (j['lastLocation']?['lat'] as num?)?.toDouble(),
        lon = (j['lastLocation']?['lon'] as num?)?.toDouble(),
        seenAt = j['lastLocation'] == null ? null : DateTime.parse(j['lastLocation']['at']).toLocal(),
        battery = j['battery'],
        oblast = j['oblast'] == null ? null : Oblast(j['oblast']['uid'], j['oblast']['title']),
        alertStatus = j['alertStatus'] ?? 'N',
        inShelterAt = j['inShelterAt'] == null ? null : DateTime.parse(j['inShelterAt']).toLocal(),
        paired = j['paired'] ?? false;

  final String id;
  final String name;
  final double? lat;
  final double? lon;
  final DateTime? seenAt;
  final int? battery;
  final Oblast? oblast;

  /// N — немає тривоги, A — тривога в області, P — часткова тривога
  final String alertStatus;
  final DateTime? inShelterAt;
  final bool paired;
}

class Geofence {
  Geofence.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        name = j['name'],
        lat = (j['lat'] as num).toDouble(),
        lon = (j['lon'] as num).toDouble(),
        radiusM = j['radiusM'];
  final String id;
  final String name;
  final double lat;
  final double lon;
  final int radiusM;
}

class FamilyEvent {
  FamilyEvent.fromJson(Map<String, dynamic> j)
      : type = j['type'],
        childName = j['childName'],
        data = Map<String, dynamic>.from(j['data'] ?? {}),
        createdAt = DateTime.parse(j['createdAt']).toLocal();
  final String type;
  final String? childName;
  final Map<String, dynamic> data;
  final DateTime createdAt;
}

class TrackPoint {
  TrackPoint(this.lat, this.lon, this.recordedAt);
  final double lat;
  final double lon;
  final DateTime recordedAt;
}

/// Клієнт REST API сервера «Мої діти».
class Api {
  Api(this.baseUrl, {this.token, http.Client? client}) : _http = client ?? http.Client();
  final String baseUrl;
  String? token;
  final http.Client _http;

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'));
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 20)));
    final decoded = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, (decoded is Map ? decoded['error'] ?? decoded['message'] : null) ?? 'Помилка ${res.statusCode}');
    }
    return decoded;
  }

  // Батьки
  Future<String> registerParent(String name) async => (await _send('POST', '/v1/parents', {'name': name}))['token'];
  Future<List<Child>> children() async =>
      (await _send('GET', '/v1/children') as List).map((j) => Child.fromJson(j)).toList();
  Future<Child> addChild(String name) async => Child.fromJson(await _send('POST', '/v1/children', {'name': name}));
  Future<String> pairingCode(String childId) async => (await _send('POST', '/v1/children/$childId/pairing-code'))['code'];
  Future<void> ring(String childId) => _send('POST', '/v1/children/$childId/ring');
  Future<List<TrackPoint>> track(String childId, DateTime from) async {
    final list = await _send('GET', '/v1/children/$childId/locations?from=${Uri.encodeComponent(from.toUtc().toIso8601String())}') as List;
    return list
        .map((j) => TrackPoint((j['lat'] as num).toDouble(), (j['lon'] as num).toDouble(), DateTime.parse(j['recordedAt']).toLocal()))
        .toList();
  }

  Future<List<Geofence>> geofences() async =>
      (await _send('GET', '/v1/geofences') as List).map((j) => Geofence.fromJson(j)).toList();
  Future<void> addGeofence(String name, double lat, double lon, int radiusM) =>
      _send('POST', '/v1/geofences', {'name': name, 'lat': lat, 'lon': lon, 'radiusM': radiusM});
  Future<void> deleteGeofence(String id) => _send('DELETE', '/v1/geofences/$id');
  Future<List<FamilyEvent>> events() async =>
      (await _send('GET', '/v1/events') as List).map((j) => FamilyEvent.fromJson(j)).toList();

  // Дитина
  Future<({String token, String childName})> pair(String code) async {
    final r = await _send('POST', '/v1/pair', {'code': code});
    return (token: r['token'] as String, childName: r['childName'] as String);
  }

  Future<Child> me() async => Child.fromJson(await _send('GET', '/v1/child/me'));
  Future<void> sendPoints(List<Map<String, dynamic>> points) => _send('POST', '/v1/child/locations', {'points': points});
  Future<void> sos(double? lat, double? lon) => _send('POST', '/v1/child/sos', {'lat': ?lat, 'lon': ?lon});
  Future<void> shelter() => _send('POST', '/v1/child/shelter');

  // Спільне
  Future<void> setPushToken(String fcmToken) => _send('PUT', '/v1/devices/me/push-token', {'fcmToken': fcmToken});
}
