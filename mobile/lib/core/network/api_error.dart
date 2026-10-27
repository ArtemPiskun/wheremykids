import 'package:dio/dio.dart';

/// Error returned by the API (`{"error": {"code", "message"}}`) or by the network.
class ApiError implements Exception {
  const ApiError({required this.code, required this.message, this.status, this.details});

  final String code;
  final String message;
  final int? status;
  final Map<String, dynamic>? details;

  static const network = 'NETWORK';
  static const timeout = 'TIMEOUT';

  bool get isNetwork => code == network || code == timeout;
  bool get isUnauthorized => status == 401;

  factory ApiError.fromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiError(
        code: err['code']?.toString() ?? 'UNKNOWN',
        message: err['message']?.toString() ?? '',
        status: e.response?.statusCode,
        details: err['details'] is Map ? Map<String, dynamic>.from(err['details'] as Map) : null,
      );
    }
    return switch (e.type) {
      DioExceptionType.connectionTimeout || DioExceptionType.receiveTimeout || DioExceptionType.sendTimeout =>
        const ApiError(code: timeout, message: 'Request timed out'),
      DioExceptionType.connectionError || DioExceptionType.unknown => const ApiError(code: network, message: 'No connection'),
      _ => ApiError(code: 'HTTP_${e.response?.statusCode ?? 0}', message: e.message ?? '', status: e.response?.statusCode),
    };
  }

  @override
  String toString() => 'ApiError($code, $status, $message)';
}
