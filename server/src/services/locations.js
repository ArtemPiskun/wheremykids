import { distanceM } from '../geo/distance.js';
import { msg } from '../notify/messages.js';
import { notifyParents, notifyChild, recordEvent } from '../notify/fanout.js';
import { classifyPoint, MAX_GEOFENCE_ACCURACY_M } from '../geo/plausibility.js';
import { getOblastStatus } from '../alerts/poller.js';

const LOW_BATTERY_PCT = 15;
const BATTERY_RESET_PCT = 30;

// Обробка пачки точок від дитини: перевірка достовірності, історія, заряд,
// геозони, область і тривога. Під час тривог GPS часто глушать або підміняють,
// тому стан дитини (місце, геозони, область) оновлюють лише надійні точки.
export async function ingestLocations({ pool, notifier, oblastResolver }, childId, points) {
  const sorted = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const { rows: [child] } = await pool.query('SELECT * FROM children WHERE id = $1', [childId]);
  let lastGood = child.last_seen_at == null ? null : {
    lat: child.last_lat, lon: child.last_lon, accuracy: child.last_accuracy_m, recordedAt: child.last_seen_at.toISOString(),
  };
  const { rows: jumpRows } = await pool.query(
    `SELECT lat, lon, accuracy_m AS accuracy, recorded_at FROM locations
     WHERE child_id = $1 AND reason = 'jump' AND recorded_at > COALESCE($2, '-infinity'::timestamptz)
     ORDER BY recorded_at DESC LIMIT 5`, [childId, child.last_seen_at]);
  const recentJumps = jumpRows.reverse().map((r) => ({ ...r, recordedAt: r.recorded_at.toISOString() }));

  let newestGood = null;
  let rejected = null;
  for (const p of sorted) {
    const { quality, reason } = classifyPoint(p, lastGood, recentJumps);
    await pool.query(
      `INSERT INTO locations(child_id, lat, lon, accuracy_m, battery_pct, recorded_at, quality, reason, source, mocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [childId, p.lat, p.lon, p.accuracy ?? null, p.battery ?? null, p.recordedAt, quality, reason, p.source ?? null, p.mocked ?? false]);
    const newer = !lastGood || Date.parse(p.recordedAt) > Date.parse(lastGood.recordedAt);
    if (quality === 'ok' && newer) {
      lastGood = p;
      newestGood = p;
      recentJumps.length = 0;
    } else if (quality === 'rejected' && newer) {
      rejected = p;
      if (reason === 'jump') recentJumps.push(p);
    }
  }

  // Заряд справжній навіть тоді, коли координати підмінені
  const latest = sorted.at(-1);
  const freshBatch = !child.last_seen_at || Date.parse(latest.recordedAt) > child.last_seen_at.getTime();
  if (freshBatch && latest.battery != null) await pool.query('UPDATE children SET battery_pct = $2 WHERE id = $1', [childId, latest.battery]);
  if (freshBatch) await checkBattery(pool, notifier, child, latest.battery);
  await updateGpsFlag(pool, child, newestGood, rejected);

  // Точки з буфера (після відсутності зв'язку) можуть бути старшими за вже відомі
  if (!newestGood) return { updated: false, gpsUnreliable: rejected != null || child.gps_unreliable_since != null };

  await pool.query(
    `UPDATE children SET last_lat = $2, last_lon = $3, last_accuracy_m = $4, last_seen_at = $5 WHERE id = $1`,
    [childId, newestGood.lat, newestGood.lon, newestGood.accuracy ?? null, newestGood.recordedAt]);
  if ((newestGood.accuracy ?? 0) <= MAX_GEOFENCE_ACCURACY_M) await checkGeofences(pool, notifier, child, newestGood);
  await checkOblast(pool, notifier, oblastResolver, child, newestGood);
  return { updated: true, gpsUnreliable: false };
}

// Позначка «GPS ненадійний»: з'являється з першою відкинутою точкою,
// зникає з першою надійною, новішою за неї
async function updateGpsFlag(pool, child, newestGood, rejected) {
  const goodAfterBad = newestGood && (!rejected || Date.parse(newestGood.recordedAt) > Date.parse(rejected.recordedAt));
  if (goodAfterBad && child.gps_unreliable_since) {
    await pool.query('UPDATE children SET gps_unreliable_since = NULL WHERE id = $1', [child.id]);
  } else if (rejected && !goodAfterBad && !child.gps_unreliable_since) {
    await pool.query('UPDATE children SET gps_unreliable_since = $2 WHERE id = $1', [child.id, rejected.recordedAt]);
    // Лише в стрічку, без пуша: під час тривоги це трапляється часто
    await recordEvent(pool, { familyId: child.family_id, childId: child.id, type: 'gps_unreliable', data: {} });
  }
}

async function checkBattery(pool, notifier, child, pct) {
  if (pct == null) return;
  if (pct <= LOW_BATTERY_PCT && !child.low_battery_sent) {
    await pool.query('UPDATE children SET low_battery_sent = true WHERE id = $1', [child.id]);
    await notifyParents(pool, notifier, child, 'low_battery', msg.lowBattery(child, pct), { battery: pct });
  } else if (pct >= BATTERY_RESET_PCT && child.low_battery_sent) {
    await pool.query('UPDATE children SET low_battery_sent = false WHERE id = $1', [child.id]);
  }
}

async function checkGeofences(pool, notifier, child, point) {
  const { rows: zones } = await pool.query(
    `SELECT g.*, s.inside FROM geofences g
     LEFT JOIN geofence_state s ON s.geofence_id = g.id AND s.child_id = $2
     WHERE g.family_id = $1`, [child.family_id, child.id]);
  for (const z of zones) {
    const d = distanceM(point.lat, point.lon, z.lat, z.lon);
    // Гістерезис, щоб неточний GPS на межі не давав серію «прибув/пішов»
    const margin = Math.min(Math.max(point.accuracy ?? 0, 20), 100);
    let inside = z.inside;
    if (inside == null) inside = d <= z.radius_m;
    else if (!inside && d <= z.radius_m - margin / 2) inside = true;
    else if (inside && d > z.radius_m + margin) inside = false;
    if (inside === z.inside) continue;
    await pool.query(
      `INSERT INTO geofence_state(child_id, geofence_id, inside, changed_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (child_id, geofence_id) DO UPDATE SET inside = EXCLUDED.inside, changed_at = now()`,
      [child.id, z.id, inside]);
    // Першу появу в зоні не вважаємо подією — це лише початковий стан
    if (z.inside == null) continue;
    await notifyParents(pool, notifier, child, inside ? 'geofence_enter' : 'geofence_exit',
      inside ? msg.geofenceEnter(child, z) : msg.geofenceExit(child, z), { geofenceId: z.id });
  }
}

async function checkOblast(pool, notifier, resolver, child, point) {
  let uid;
  try {
    uid = await resolver.resolve(point.lat, point.lon);
  } catch {
    return; // геокодер недоступний — лишаємо попередню область
  }
  if (uid == null || uid === child.oblast_uid) return;
  await pool.query('UPDATE children SET oblast_uid = $2 WHERE id = $1', [child.id, uid]);
  const status = await getOblastStatus(pool, uid);
  if (status === 'N') return;
  await notifyParents(pool, notifier, child, 'moved_into_alert', msg.movedIntoAlert(child, uid), { oblastUid: uid, status });
  await notifyChild(pool, notifier, child, 'alert_start', msg.alertChild(uid, status), { oblastUid: uid, status });
}
