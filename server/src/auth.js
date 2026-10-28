import { createHash, randomBytes, randomInt } from 'node:crypto';

export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const newPairingCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

// Хук Fastify: за токеном визначає, хто робить запит — батько чи дитина
export function authHook(pool) {
  return async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return reply.code(401).send({ error: 'Потрібна авторизація' });
    const { rows } = await pool.query(
      `SELECT d.id AS device_id, d.parent_id, d.child_id,
              COALESCE(p.family_id, c.family_id) AS family_id
       FROM devices d
       LEFT JOIN parents p ON p.id = d.parent_id
       LEFT JOIN children c ON c.id = d.child_id
       WHERE d.token_hash = $1`, [hashToken(token)]);
    if (!rows.length) return reply.code(401).send({ error: 'Недійсний токен' });
    const r = rows[0];
    req.actor = r.parent_id
      ? { kind: 'parent', deviceId: r.device_id, parentId: r.parent_id, familyId: r.family_id }
      : { kind: 'child', deviceId: r.device_id, childId: r.child_id, familyId: r.family_id };
  };
}

export function requireParent(req, reply, done) {
  if (req.actor?.kind !== 'parent') return reply.code(403).send({ error: 'Лише для батьків' });
  done();
}

export function requireChild(req, reply, done) {
  if (req.actor?.kind !== 'child') return reply.code(403).send({ error: 'Лише для пристрою дитини' });
  done();
}
