import 'dart:math' as math;

import 'package:de_moi_dity/location/backoff.dart';
import 'package:de_moi_dity/location/fix.dart';
import 'package:de_moi_dity/location/location_queue.dart';
import 'package:de_moi_dity/location/sync_service.dart';
import 'package:de_moi_dity/location/tracking_policy.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Fix fix(int minutesAgo) => Fix(lat: 50.45, lng: 30.52, accuracy: 10, timestamp: DateTime.now().subtract(Duration(minutes: minutesAgo)));

void main() {
  sqfliteFfiInit();
  late LocationQueue queue;

  setUp(() async => queue = await LocationQueue.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath));
  tearDown(() => queue.close());

  test('returns points oldest first and removes acknowledged ones', () async {
    await queue.enqueue(fix(1), MotionState.moving);
    await queue.enqueue(fix(5), MotionState.moving);
    final batch = await queue.peek(10);
    expect(batch.first.fix.timestamp.isBefore(batch.last.fix.timestamp), isTrue);
    expect(batch.first.toApiJson()['recordedAt'], endsWith('Z'));
    await queue.remove([batch.first.clientId]);
    expect(await queue.count(), 1);
  });

  test('drops points older than 7 days', () async {
    await queue.enqueue(fix(8 * 24 * 60), MotionState.moving);
    await queue.enqueue(fix(1), MotionState.moving);
    expect(await queue.count(), 1);
  });

  test('sync uploads in order and keeps points when offline', () async {
    for (var i = 0; i < 250; i++) {
      await queue.enqueue(fix(300 - i), MotionState.moving);
    }
    final uploaded = <int>[];
    var online = false;
    final sync = SyncService(
      queue: queue,
      backoff: Backoff(base: const Duration(milliseconds: 1), max: const Duration(milliseconds: 2)),
      upload: (points, {battery, charging}) async {
        if (!online) throw const UploadException(UploadFailure.retryable, 'offline');
        uploaded.add(points.length);
      },
    );
    await sync.flush();
    expect(await queue.count(), 250);

    online = true;
    await sync.kick();
    expect(uploaded, [100, 100, 50]);
    expect(await queue.count(), 0);
    await sync.dispose();
  });

  test('network coming back uploads at once, even deep into the backoff', () async {
    for (var i = 0; i < 3; i++) {
      await queue.enqueue(fix(10 - i), MotionState.moving);
    }
    var online = false;
    final sync = SyncService(
      queue: queue,
      upload: (points, {battery, charging}) async {
        if (!online) throw const UploadException(UploadFailure.retryable, 'offline');
      },
    );
    // Several failed attempts: the next automatic retry is now minutes away.
    for (var i = 0; i < 6; i++) {
      await sync.flush();
    }
    expect(await queue.count(), 3);

    online = true;
    await sync.kick().timeout(const Duration(seconds: 1));
    expect(await queue.count(), 0);
    await sync.dispose();
  });

  test('an expired session keeps the points for after the refresh', () async {
    await queue.enqueue(fix(2), MotionState.moving);
    final sync = SyncService(
      queue: queue,
      upload: (_, {battery, charging}) async => throw const UploadException(UploadFailure.unauthorized, 'TOKEN_INVALID'),
    );
    await sync.flush();
    expect(await queue.count(), 1);
    await sync.dispose();
  });

  test('a batch the server rejects permanently is dropped instead of blocking the queue', () async {
    await queue.enqueue(fix(2), MotionState.moving);
    final sync = SyncService(queue: queue, upload: (_, {battery, charging}) async => throw const UploadException(UploadFailure.permanent, 'VALIDATION_FAILED'));
    await sync.flush();
    expect(await queue.count(), 0);
    await sync.dispose();
  });

  test('backoff grows exponentially with jitter and caps at the maximum', () {
    final b = Backoff(random: math.Random(1));
    final delays = [for (var i = 0; i < 10; i++) b.next()];
    expect(delays.first.inSeconds, inInclusiveRange(2, 5));
    expect(delays.last, lessThanOrEqualTo(const Duration(minutes: 5)));
    expect(delays.last, greaterThanOrEqualTo(const Duration(minutes: 2, seconds: 30)));
    b.reset();
    expect(b.next().inSeconds, lessThanOrEqualTo(5));
  });
}
