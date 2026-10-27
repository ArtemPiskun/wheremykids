import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../location/sync_service.dart';

typedef Json = Map<String, dynamic>;

class ChildProfile {
  const ChildProfile({required this.displayName, required this.parents, required this.canPause, required this.pausedUntil});

  factory ChildProfile.fromJson(Json j) => ChildProfile(
        displayName: j['displayName'] as String,
        parents: [for (final p in j['parents'] as List) (p as Map)['displayName'] as String],
        canPause: j['canPause'] as bool? ?? false,
        pausedUntil: j['sharingPausedUntil'] == null ? null : DateTime.parse(j['sharingPausedUntil'] as String),
      );

  final String displayName;
  final List<String> parents;
  final bool canPause;
  final DateTime? pausedUntil;

  bool get paused => pausedUntil != null && pausedUntil!.isAfter(DateTime.now());
}

class ChildRepository {
  ChildRepository(this.api);
  final ApiClient api;

  Future<ChildProfile> me() async => ChildProfile.fromJson(await api.get<Json>('/v1/child/me'));

  /// Used by [SyncService]; maps errors to retryable vs permanent so bad batches never block the queue.
  Future<void> uploadBatch(List<Map<String, Object?>> points, {int? battery, bool? charging}) async {
    try {
      await api.post<Json>('/v1/locations/batch', {
        'points': points,
        if (battery != null) 'battery': {'level': battery, 'charging': charging ?? false},
      });
    } on ApiError catch (e) {
      if (e.isNetwork || e.status == null || e.status! >= 500 || e.status == 429) {
        throw UploadException(UploadFailure.retryable, e.code);
      }
      if (e.status == 401) throw UploadException(UploadFailure.unauthorized, e.code);
      throw UploadException(UploadFailure.permanent, e.code);
    } on DioException catch (e) {
      throw UploadException(UploadFailure.retryable, e.message);
    }
  }

  Future<void> heartbeat({required int battery, required bool charging}) =>
      api.put<void>('/v1/devices/current', {'battery': {'level': battery, 'charging': charging}});

  Future<Json> raiseSos({required String clientId, double? lat, double? lng, double? accuracy, int? battery}) => api.post<Json>('/v1/sos', {
        'clientId': clientId,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (accuracy != null) 'accuracy': accuracy,
        if (battery != null) 'battery': {'level': battery},
      });

  Future<void> cancelSos(String id) => api.post<void>('/v1/sos/$id/cancel');
  Future<ChildProfile> pause(int minutes) async {
    await api.post<Json>('/v1/child/sharing/pause', {'minutes': minutes});
    return me();
  }

  Future<ChildProfile> resume() async {
    await api.post<Json>('/v1/child/sharing/resume');
    return me();
  }

  Future<void> leave() => api.post<void>('/v1/child/leave');
}
