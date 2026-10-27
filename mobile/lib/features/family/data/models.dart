import '../../../core/map/app_map.dart';

enum ChildStatus { online, recent, offline, paused }

ChildStatus _status(Object? v) => ChildStatus.values.asNameMap()[v] ?? ChildStatus.offline;
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v as String);
double _d(Object? v) => (v as num).toDouble();

class ChildLocation {
  const ChildLocation({required this.point, required this.accuracy, required this.recordedAt, required this.source, this.battery});

  factory ChildLocation.fromJson(Map<String, dynamic> j) => ChildLocation(
        point: LatLng(_d(j['lat']), _d(j['lng'])),
        accuracy: _d(j['accuracy']),
        recordedAt: DateTime.parse(j['recordedAt'] as String),
        source: j['source'] as String? ?? 'gps',
        battery: (j['battery'] as num?)?.toInt(),
      );

  final LatLng point;
  final double accuracy;
  final DateTime recordedAt;
  final String source;
  final int? battery;
}

class ChildSummary {
  const ChildSummary({
    required this.id,
    required this.displayName,
    required this.connected,
    required this.status,
    this.avatar,
    this.birthYear,
    this.phone,
    this.lastSeenAt,
    this.battery,
    this.charging,
    this.sharingPausedUntil,
    this.location,
  });

  factory ChildSummary.fromJson(Map<String, dynamic> j) => ChildSummary(
        id: j['id'] as String,
        displayName: j['displayName'] as String,
        avatar: j['avatar'] as String?,
        birthYear: (j['birthYear'] as num?)?.toInt(),
        phone: j['phone'] as String?,
        connected: j['connected'] as bool? ?? false,
        status: _status(j['status']),
        lastSeenAt: _date(j['lastSeenAt']),
        battery: (j['battery'] as num?)?.toInt(),
        charging: j['charging'] as bool?,
        sharingPausedUntil: _date(j['sharingPausedUntil']),
      );

  final String id;
  final String displayName;
  final String? avatar;
  final int? birthYear;
  final String? phone;
  final bool connected;
  final ChildStatus status;
  final DateTime? lastSeenAt;
  final int? battery;
  final bool? charging;
  final DateTime? sharingPausedUntil;
  final ChildLocation? location;

  ChildSummary copyWith({
    bool? connected,
    ChildStatus? status,
    DateTime? lastSeenAt,
    int? battery,
    bool? charging,
    DateTime? sharingPausedUntil,
    bool clearPause = false,
    ChildLocation? location,
  }) =>
      ChildSummary(
        id: id,
        displayName: displayName,
        avatar: avatar,
        birthYear: birthYear,
        phone: phone,
        connected: connected ?? this.connected,
        status: status ?? this.status,
        lastSeenAt: lastSeenAt ?? this.lastSeenAt,
        battery: battery ?? this.battery,
        charging: charging ?? this.charging,
        sharingPausedUntil: clearPause ? null : sharingPausedUntil ?? this.sharingPausedUntil,
        location: location ?? this.location,
      );
}

class FamilyDetails {
  const FamilyDetails({required this.id, required this.name, required this.plan, required this.historyDays, required this.children, required this.parents, required this.isOwner});

  factory FamilyDetails.fromJson(Map<String, dynamic> j) => FamilyDetails(
        id: j['id'] as String,
        name: j['name'] as String,
        plan: j['plan'] as String,
        historyDays: ((j['limits'] as Map)['historyDays'] as num).toInt(),
        isOwner: j['myRole'] == 'owner',
        parents: [for (final p in j['parents'] as List) (p as Map)['displayName'] as String],
        children: [for (final c in j['children'] as List) ChildSummary.fromJson(Map<String, dynamic>.from(c as Map))],
      );

  final String id;
  final String name;
  final String plan;
  final int historyDays;
  final bool isOwner;
  final List<String> parents;
  final List<ChildSummary> children;
}

class Invite {
  const Invite({required this.code, required this.qrPayload, required this.expiresAt});
  factory Invite.fromJson(Map<String, dynamic> j) =>
      Invite(code: j['code'] as String, qrPayload: j['qrPayload'] as String, expiresAt: DateTime.parse(j['expiresAt'] as String));
  final String code;
  final String qrPayload;
  final DateTime expiresAt;
}

enum ZoneKind { home, school, sport, other }

class Geofence {
  const Geofence({required this.id, required this.name, required this.kind, required this.center, required this.radiusM, required this.notifyEnter, required this.notifyExit});

  factory Geofence.fromJson(Map<String, dynamic> j) => Geofence(
        id: j['id'] as String,
        name: j['name'] as String,
        kind: ZoneKind.values.byName(j['kind'] as String),
        center: LatLng(_d(j['lat']), _d(j['lng'])),
        radiusM: (j['radiusM'] as num).toInt(),
        notifyEnter: j['notifyEnter'] as bool,
        notifyExit: j['notifyExit'] as bool,
      );

  final String id;
  final String name;
  final ZoneKind kind;
  final LatLng center;
  final int radiusM;
  final bool notifyEnter;
  final bool notifyExit;
}

class SosAlert {
  const SosAlert({required this.id, required this.childId, required this.status, required this.createdAt, this.battery, this.location, this.route = const [], this.childName, this.childPhone, this.acknowledgedByName});

  factory SosAlert.fromJson(Map<String, dynamic> j) {
    final loc = j['location'] as Map?;
    return SosAlert(
      id: j['id'] as String,
      childId: j['childId'] as String,
      status: j['status'] as String,
      createdAt: DateTime.parse(j['createdAt'] as String),
      battery: (j['battery'] as num?)?.toInt(),
      location: loc == null ? null : LatLng(_d(loc['lat']), _d(loc['lng'])),
      route: [for (final p in (j['route'] as List?) ?? const []) LatLng(_d((p as Map)['lat']), _d(p['lng']))],
      childName: j['childName'] as String?,
      childPhone: j['childPhone'] as String?,
      acknowledgedByName: j['acknowledgedByName'] as String?,
    );
  }

  final String id;
  final String childId;
  final String status;
  final DateTime createdAt;
  final int? battery;
  final LatLng? location;
  final List<LatLng> route;
  final String? childName;
  final String? childPhone;
  final String? acknowledgedByName;

  bool get open => status == 'active' || status == 'acknowledged';
}

class HistoryResult {
  const HistoryResult({required this.points, required this.historyDays, required this.truncated});
  factory HistoryResult.fromJson(Map<String, dynamic> j) => HistoryResult(
        points: [for (final p in j['points'] as List) ChildLocation.fromJson(Map<String, dynamic>.from(p as Map))],
        historyDays: (j['historyDays'] as num).toInt(),
        truncated: j['truncated'] as bool? ?? false,
      );
  final List<ChildLocation> points;
  final int historyDays;
  final bool truncated;
}
