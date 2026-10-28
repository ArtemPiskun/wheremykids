import { distanceM } from '../geo/distance.js';
import { msg } from '../notify/messages.js';
import { notifyParents, notifyChild } from '../notify/fanout.js';
import { getOblastStatus } from '../alerts/poller.js';

const LOW_BATTERY_PCT = 15;
const BATTERY_RESET_PCT = 30;

// Обробка пачки точок від дитини: історія, заряд, геозони, область і тривога
export async function ingestLocations({ pool, notifier, oblastResolver }, childId, points) {
  const sorted = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  for (const p of sorted) {
    await pool.query(
      `INSERT INTO locations(child_id, lat, lon, accuracy_m, battery_pct, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [childId, p.lat, p.lon, p.accuracy ?? null, p.battery ?? null, p.recordedAt]);
  }
  const { rows } = await pool.query('SELECT * FROM children WHERE id = $1', [childId]);
  const child = rows[0];
  const latest = sorted.at(-1);
  // Точки з буфера (після відсутності зв'язку) можуть бути старшими за вже відомі
  if (child.last_seen_at && Date.parse(latest.recordedAt) <= child.last_seen_at.getTime()) return { updated: false };

  await pool.query(
    `UPDATE children SET last_lat = $2, last_lon = $3, last_accuracy_m = $4, last_seen_at = $5,
       battery_pct = COALESCE($6, battery_pct) WHERE id = $1`,
    [childId, latest.lat, latest.lon, latest.accuracy ?? null, latest.recordedAt, latest.battery ?? null]);

  await checkBattery(pool, notifier, child, latest.battery);
  await checkGeofences(pool, notifier, child, latest);
  await checkOblast(pool, notifier, oblastResolver, child, latest);
  return { updated: true };
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
