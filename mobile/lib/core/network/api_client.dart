import 'dart:async';

import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/session_store.dart';
import 'api_error.dart';

/// Dio wrapper: attaches the access token, refreshes it once on 401 (single-flight,
/// so parallel requests never present the same refresh token twice and trigger
/// the server's reuse detection), and maps failures to [ApiError].
class ApiClient {
  ApiClient({required this.store, required this.onSessionExpired, String? baseUrl, Dio? dio})
      : dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl ?? Env.apiUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 20),
              sendTimeout: const Duration(seconds: 20),
              contentType: Headers.jsonContentType,
            )) {
    // Refresh goes through an interceptor-free client: a request issued from inside a
    // queued error handler on the same Dio would wait behind that handler forever.
    _refreshDio = Dio(this.dio.options.copyWith());
    this.dio.interceptors.add(QueuedInterceptorsWrapper(onRequest: _onRequest, onError: _onError));
  }

  final Dio dio;
  late final Dio _refreshDio;
  final SessionStore store;
  final Future<void> Function() onSessionExpired;

  Session? _session;
  Future<Session?>? _refreshing;

  Session? get session => _session;

  Future<Session?> restore() async => _session = await store.read();

  Future<void> setSession(Session session) async {
    _session = session;
    await store.write(session);
  }

  Future<void> clearSession() async {
    _session = null;
    await store.clear();
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) => _wrap(() => dio.get<T>(path, queryParameters: query));
  Future<T> post<T>(String path, [Object? body]) => _wrap(() => dio.post<T>(path, data: body ?? const <String, dynamic>{}));
  Future<T> patch<T>(String path, Object body) => _wrap(() => dio.patch<T>(path, data: body));
  Future<T> put<T>(String path, Object body) => _wrap(() => dio.put<T>(path, data: body));
  Future<T> delete<T>(String path) => _wrap(() => dio.delete<T>(path));

  Future<T> _wrap<T>(Future<Response<T>> Function() call) async {
    try {
      return (await call()).data as T;
    } on DioException catch (e) {
      throw e.error is ApiError ? e.error! as ApiError : ApiError.fromDio(e);
    }
  }

  /// Returns a valid access token, refreshing if needed; used by the realtime client too.
  Future<String?> freshAccessToken() async => (await _refresh())?.accessToken;

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _session?.accessToken;
    if (token != null && options.extra['noAuth'] != true) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  Future<void> _onError(DioException err, ErrorInterceptorHandler handler) async {
    final apiError = ApiError.fromDio(err);
    final retried = err.requestOptions.extra['retried'] == true;
    final refreshable = apiError.status == 401 && apiError.code == 'TOKEN_INVALID' && !retried && _session != null;
    if (!refreshable) {
      if (apiError.status == 401 && (apiError.code == 'DEVICE_REVOKED' || apiError.code.startsWith('REFRESH_'))) {
        await _expire();
      }
      return handler.next(err.copyWith(error: apiError));
    }
    final session = await _refresh();
    if (session == null) return handler.next(err.copyWith(error: apiError));
    final options = err.requestOptions
      ..extra['retried'] = true
      ..headers['Authorization'] = 'Bearer ${session.accessToken}';
    try {
      handler.resolve(await dio.fetch(options));
    } on DioException catch (e) {
      handler.next(e.copyWith(error: ApiError.fromDio(e)));
    }
  }

  Future<Session?> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<Session?> _doRefresh() async {
    final current = _session;
    if (current == null) return null;
    try {
      final res = await _refreshDio.post<Map<String, dynamic>>('/v1/auth/refresh', data: {'refreshToken': current.refreshToken});
      final next = current.copyWith(accessToken: res.data!['accessToken'] as String, refreshToken: res.data!['refreshToken'] as String);
      await setSession(next);
      return next;
    } on DioException catch (e) {
      final error = ApiError.fromDio(e);
      // Offline is not a logout: keep the session and try again later.
      if (error.status == 401) await _expire();
      return null;
    }
  }

  Future<void> _expire() async {
    if (_session == null) return;
    await clearSession();
    await onSessionExpired();
  }
}
