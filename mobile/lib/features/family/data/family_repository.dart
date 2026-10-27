import '../../../core/network/api_client.dart';
import 'models.dart';

typedef Json = Map<String, dynamic>;

class FamilyRepository {
  FamilyRepository(this.api);
  final ApiClient api;

  Future<List<Json>> myFamilies() async => List<Json>.from(((await api.get<Json>('/v1/families'))['families'] as List).map((e) => Json.from(e as Map)));

  Future<FamilyDetails> get(String familyId) async => FamilyDetails.fromJson(await api.get<Json>('/v1/families/$familyId'));

  Future<FamilyDetails> create(String name) async => FamilyDetails.fromJson(await api.post<Json>('/v1/families', {'name': name}));

  Future<String> addChild(String familyId, {required String name, int? birthYear, String? phone, String? avatar}) async {
    final res = await api.post<Json>('/v1/families/$familyId/children', {
      'displayName': name,
      if (birthYear != null) 'birthYear': birthYear,
      if (phone != null) 'phone': phone,
      if (avatar != null) 'avatar': avatar,
    });
    return res['id'] as String;
  }

  Future<Invite> createChildInvite(String familyId, String childId) async =>
      Invite.fromJson(await api.post<Json>('/v1/families/$familyId/children/$childId/invites'));

  Future<Map<String, ChildSummaryPatch>> latest(String familyId) async {
    final res = await api.get<Json>('/v1/families/$familyId/locations/latest');
    return {
      for (final raw in res['children'] as List)
        (raw as Map)['childId'] as String: ChildSummaryPatch.fromJson(Json.from(raw)),
    };
  }

  Future<HistoryResult> history(String childId, DateTime from, DateTime to) async => HistoryResult.fromJson(await api.get<Json>(
        '/v1/children/$childId/history',
        query: {'from': from.toUtc().toIso8601String(), 'to': to.toUtc().toIso8601String()},
      ));

  Future<void> locate(String childId) => api.post<void>('/v1/children/$childId/locate');

  Future<List<Geofence>> geofences(String familyId) async =>
      [for (final g in (await api.get<Json>('/v1/families/$familyId/geofences'))['geofences'] as List) Geofence.fromJson(Json.from(g as Map))];

  Future<Geofence> createGeofence(String familyId, {required String name, required ZoneKind kind, required double lat, required double lng, required int radiusM}) async =>
      Geofence.fromJson(await api.post<Json>('/v1/families/$familyId/geofences', {'name': name, 'kind': kind.name, 'lat': lat, 'lng': lng, 'radiusM': radiusM}));

  Future<void> deleteGeofence(String familyId, String id) => api.delete<void>('/v1/families/$familyId/geofences/$id');

  Future<List<SosAlert>> openAlerts(String familyId) async =>
      [for (final a in (await api.get<Json>('/v1/families/$familyId/sos'))['alerts'] as List) SosAlert.fromJson(Json.from(a as Map))];

  Future<SosAlert> acknowledge(String sosId) async => SosAlert.fromJson(await api.post<Json>('/v1/sos/$sosId/ack'));
  Future<SosAlert> resolve(String sosId) async => SosAlert.fromJson(await api.post<Json>('/v1/sos/$sosId/resolve'));

  Future<Json> exportData() => api.get<Json>('/v1/me/export');
  Future<void> deleteAccount() => api.delete<void>('/v1/me');
}

/// Live fields from `/locations/latest` and realtime events, merged onto [ChildSummary].
class ChildSummaryPatch {
  const ChildSummaryPatch({required this.status, this.lastSeenAt, this.battery, this.charging, this.location, this.sharingPausedUntil});

  factory ChildSummaryPatch.fromJson(Json j) => ChildSummaryPatch(
        status: ChildStatus.values.asNameMap()[j['status']] ?? ChildStatus.offline,
        lastSeenAt: j['lastSeenAt'] == null ? null : DateTime.parse(j['lastSeenAt'] as String),
        battery: (j['battery'] as num?)?.toInt(),
        charging: j['charging'] as bool?,
        sharingPausedUntil: j['sharingPausedUntil'] == null ? null : DateTime.parse(j['sharingPausedUntil'] as String),
        location: j['location'] == null ? null : ChildLocation.fromJson(Json.from(j['location'] as Map)),
      );

  final ChildStatus status;
  final DateTime? lastSeenAt;
  final int? battery;
  final bool? charging;
  final ChildLocation? location;
  final DateTime? sharingPausedUntil;
}
