import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import 'fix.dart';
import 'tracking_policy.dart';

class QueuedPoint {
  const QueuedPoint({required this.clientId, required this.fix, required this.motion});

  final String clientId;
  final Fix fix;
  final MotionState motion;

  Map<String, Object?> toApiJson() => {
        'clientId': clientId,
        'lat': fix.lat,
        'lng': fix.lng,
        'accuracy': double.parse(fix.accuracy.toStringAsFixed(1)),
        if (fix.speed != null && fix.speed! >= 0) 'speed': fix.speed,
        if (fix.heading != null && fix.heading! >= 0) 'heading': fix.heading,
        if (fix.altitude != null) 'altitude': fix.altitude,
        'recordedAt': fix.timestamp.toUtc().toIso8601String(),
        'source': fix.source.name,
        'motion': motion.name,
      };
}

/// Durable outbox for fixes. Survives app restarts and long periods without internet.
class LocationQueue {
  LocationQueue(this._db);

  static const maxPoints = 5000;
  static const maxAge = Duration(days: 7);
  static const _table = 'pending_locations';
  static const _uuid = Uuid();

  final Database _db;

  static Future<LocationQueue> open({DatabaseFactory? factory, String? path}) async {
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await dbFactory.getDatabasesPath(), 'location_queue.db');
    final db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, _) => db.execute('''
          CREATE TABLE $_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL UNIQUE,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            accuracy REAL NOT NULL,
            speed REAL,
            heading REAL,
            altitude REAL,
            recorded_at INTEGER NOT NULL,
            source TEXT NOT NULL,
            motion TEXT NOT NULL
          )'''),
      ),
    );
    return LocationQueue(db);
  }

  Future<QueuedPoint> enqueue(Fix fix, MotionState motion) async {
    final point = QueuedPoint(clientId: _uuid.v4(), fix: fix, motion: motion);
    await _db.insert(_table, {
      'client_id': point.clientId,
      'lat': fix.lat,
      'lng': fix.lng,
      'accuracy': fix.accuracy,
      'speed': fix.speed,
      'heading': fix.heading,
      'altitude': fix.altitude,
      'recorded_at': fix.timestamp.millisecondsSinceEpoch,
      'source': fix.source.name,
      'motion': motion.name,
    });
    await _enforceLimits();
    return point;
  }

  /// Oldest first, so the server receives the route in order.
  Future<List<QueuedPoint>> peek(int limit) async {
    final rows = await _db.query(_table, orderBy: 'recorded_at ASC, id ASC', limit: limit);
    return rows.map(_fromRow).toList();
  }

  Future<void> remove(Iterable<String> clientIds) async {
    final ids = clientIds.toList();
    if (ids.isEmpty) return;
    await _db.delete(_table, where: 'client_id IN (${List.filled(ids.length, '?').join(',')})', whereArgs: ids);
  }

  Future<int> count() async => Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM $_table')) ?? 0;

  Future<DateTime?> oldestRecordedAt() async {
    final v = Sqflite.firstIntValue(await _db.rawQuery('SELECT MIN(recorded_at) FROM $_table'));
    return v == null ? null : DateTime.fromMillisecondsSinceEpoch(v);
  }

  Future<void> clear() => _db.delete(_table);

  Future<void> close() => _db.close();

  /// The server rejects points older than 7 days; beyond the size cap, stationary
  /// points go first because they add the least to the route.
  Future<void> _enforceLimits() async {
    final cutoff = DateTime.now().subtract(maxAge).millisecondsSinceEpoch;
    await _db.delete(_table, where: 'recorded_at < ?', whereArgs: [cutoff]);
    final overflow = await count() - maxPoints;
    if (overflow <= 0) return;
    final dropped = await _db.rawDelete(
      'DELETE FROM $_table WHERE id IN (SELECT id FROM $_table WHERE motion = ? ORDER BY recorded_at ASC LIMIT ?)',
      [MotionState.stationary.name, overflow],
    );
    final rest = overflow - dropped;
    if (rest > 0) {
      await _db.rawDelete('DELETE FROM $_table WHERE id IN (SELECT id FROM $_table ORDER BY recorded_at ASC LIMIT ?)', [rest]);
    }
  }

  QueuedPoint _fromRow(Map<String, Object?> r) => QueuedPoint(
        clientId: r['client_id']! as String,
        motion: MotionState.values.byName(r['motion']! as String),
        fix: Fix(
          lat: r['lat']! as double,
          lng: r['lng']! as double,
          accuracy: (r['accuracy']! as num).toDouble(),
          speed: (r['speed'] as num?)?.toDouble(),
          heading: (r['heading'] as num?)?.toDouble(),
          altitude: (r['altitude'] as num?)?.toDouble(),
          timestamp: DateTime.fromMillisecondsSinceEpoch(r['recorded_at']! as int),
          source: FixSource.values.byName(r['source']! as String),
        ),
      );
}
