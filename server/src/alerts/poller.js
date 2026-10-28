import { parseStatusString } from './oblasts.js';
import { msg } from '../notify/messages.js';
import { notifyParents, notifyChild } from '../notify/fanout.js';

// Порівнює новий стан з тим, що в базі, зберігає зміни
// й сповіщає родини дітей, які зараз у змінених областях.
export async function applyStatus(pool, notifier, statusString) {
  const next = parseStatusString(statusString);
  const { rows } = await pool.query('SELECT oblast_uid, status FROM oblast_alerts');
  const prev = new Map(rows.map((r) => [r.oblast_uid, r.status]));
  const firstRun = prev.size === 0;
  const changed = [];
  for (const [uid, status] of next) {
    const before = prev.get(uid) ?? 'N';
    if (prev.get(uid) === status) continue;
    await pool.query(
      `INSERT INTO oblast_alerts(oblast_uid, status, changed_at) VALUES ($1, $2, now())
       ON CONFLICT (oblast_uid) DO UPDATE SET status = EXCLUDED.status, changed_at = now()`, [uid, status]);
    // На першому запуску лише запам'ятовуємо стан, щоб не розсилати пуші про давні тривоги
    if (!firstRun && before !== status) changed.push({ uid, before, status });
  }
  for (const c of changed) {
    const { rows: kids } = await pool.query('SELECT * FROM children WHERE oblast_uid = $1', [c.uid]);
    for (const child of kids) {
      if (c.status === 'N') {
        await notifyParents(pool, notifier, child, 'alert_end', msg.alertEndParent(child, c.uid), { oblastUid: c.uid });
        await notifyChild(pool, notifier, child, 'alert_end', msg.alertEndChild(c.uid), { oblastUid: c.uid });
        await pool.query('UPDATE children SET in_shelter_at = NULL WHERE id = $1', [child.id]);
      } else {
        await notifyParents(pool, notifier, child, 'alert_start', msg.alertParent(child, c.uid, c.status), { oblastUid: c.uid, status: c.status });
        await notifyChild(pool, notifier, child, 'alert_start', msg.alertChild(c.uid, c.status), { oblastUid: c.uid, status: c.status });
      }
    }
  }
  return changed;
}

export async function getOblastStatus(db, uid) {
  if (uid == null) return 'N';
  const { rows } = await db.query('SELECT status FROM oblast_alerts WHERE oblast_uid = $1', [uid]);
  return rows[0]?.status ?? 'N';
}

export function startPoller({ pool, notifier, source, intervalMs, log }) {
  let stopped = false;
  let timer;
  const tick = async () => {
    try {
      const changed = await applyStatus(pool, notifier, await source.fetchStatusString());
      if (changed.length) log.info({ changed }, 'зміни тривог');
    } catch (err) {
      log.warn({ err: err.message }, 'не вдалося оновити тривоги');
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}
