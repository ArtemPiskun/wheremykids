import 'dart:async';

import 'package:flutter/foundation.dart';

import 'backoff.dart';
import 'location_queue.dart';

/// Uploads a batch; returns normally on success.
typedef BatchUploader = Future<void> Function(List<Map<String, Object?>> points, {int? battery, bool? charging});

/// Classifies upload failures. Permanent failures drop the batch instead of blocking the queue forever.
enum UploadFailure { retryable, permanent, unauthorized }

class UploadException implements Exception {
  const UploadException(this.kind, [this.message]);
  final UploadFailure kind;
  final String? message;
  @override
  String toString() => 'UploadException($kind, $message)';
}

class SyncStatus {
  const SyncStatus({required this.pending, required this.lastSuccess, required this.lastError, required this.retryAt});
  final int pending;
  final DateTime? lastSuccess;
  final Object? lastError;
  final DateTime? retryAt;
}

/// Drains [LocationQueue] to the server in order, with backoff while offline.
class SyncService {
  SyncService({required this.queue, required this.upload, Backoff? backoff, this.batchSize = 100})
      : _backoff = backoff ?? Backoff();

  final LocationQueue queue;
  final BatchUploader upload;
  final int batchSize;
  final Backoff _backoff;

  final _status = StreamController<SyncStatus>.broadcast();
  Timer? _retryTimer;
  Future<void>? _running;
  DateTime? _lastSuccess;
  Object? _lastError;
  DateTime? _retryAt;

  int? battery;
  bool? charging;

  Stream<SyncStatus> get status => _status.stream;

  /// Connectivity came back or the app was opened: try now and forget earlier failures.
  Future<void> kick() {
    _backoff.reset();
    _retryTimer?.cancel();
    _retryAt = null;
    return flush();
  }

  /// Uploads everything pending. Concurrent calls share one run.
  Future<void> flush() => _running ??= _drain().whenComplete(() => _running = null);

  Future<void> _drain() async {
    while (true) {
      final batch = await queue.peek(batchSize);
      if (batch.isEmpty) break;
      try {
        await upload(batch.map((b) => b.toApiJson()).toList(), battery: battery, charging: charging);
        await queue.remove(batch.map((b) => b.clientId));
        _backoff.reset();
        _lastSuccess = DateTime.now();
        _lastError = null;
      } on UploadException catch (e) {
        _lastError = e;
        if (e.kind == UploadFailure.permanent) {
          // The server will never accept this batch (e.g. validation); keep the rest flowing.
          debugPrint('Dropping ${batch.length} points rejected by the server: ${e.message}');
          await queue.remove(batch.map((b) => b.clientId));
          continue;
        }
        _scheduleRetry();
        break;
      } catch (e) {
        _lastError = e;
        _scheduleRetry();
        break;
      }
    }
    await _emit();
  }

  void _scheduleRetry() {
    final delay = _backoff.next();
    _retryAt = DateTime.now().add(delay);
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () => unawaited(flush()));
  }

  Future<void> _emit() async {
    if (_status.isClosed) return;
    _status.add(SyncStatus(pending: await queue.count(), lastSuccess: _lastSuccess, lastError: _lastError, retryAt: _retryAt));
  }

  Future<void> dispose() async {
    _retryTimer?.cancel();
    await _status.close();
  }
}
