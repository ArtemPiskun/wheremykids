import { hashToken, newToken, newPairingCode } from '../auth.js';
import { tx } from '../db.js';

const INVITE_TTL_HOURS = 24;
const name = { type: 'string', minLength: 1, maxLength: 60 };

// Другий батько: запрошення в сім'ю за кодом
export function publicFamilyRoutes(app, { pool }) {
  app.post('/v1/parents/join', {
    schema: {
      body: {
        type: 'object', required: ['name', 'code'],
        properties: { name, code: { type: 'string', pattern: '^[0-9]{6}$' } },
      },
    },
  }, async (req, reply) => {
    const token = newToken();
    const result = await tx(pool, async (db) => {
      const { rows } = await db.query(
        `UPDATE family_invites SET used_at = now()
         WHERE code = $1 AND used_at IS NULL AND expires_at > now() RETURNING family_id`, [req.body.code]);
      if (!rows.length) return null;
      const familyId = rows[0].family_id;
      const { rows: [parent] } = await db.query(
        'INSERT INTO parents(family_id, name) VALUES ($1, $2) RETURNING id', [familyId, req.body.name]);
      await db.query('INSERT INTO devices(parent_id, token_hash) VALUES ($1, $2)', [parent.id, hashToken(token)]);
      return { parentId: parent.id, familyId };
    });
    if (!result) return reply.code(404).send({ error: 'Код недійсний або прострочений' });
    return reply.code(201).send({ token, ...result });
  });
}

export function parentFamilyRoutes(p, { pool }) {
  p.get('/v1/family', async (req) => {
    const { rows } = await pool.query(
      'SELECT id, name, id = $2 AS "isMe" FROM parents WHERE family_id = $1 ORDER BY created_at',
      [req.actor.familyId, req.actor.parentId]);
    return { parents: rows };
  });

  p.post('/v1/family/invites', async (req, reply) => {
    for (let i = 0; i < 5; i++) {
      const { rows } = await pool.query(
        `INSERT INTO family_invites(code, family_id, created_by, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(hours => $4))
         ON CONFLICT (code) DO UPDATE SET family_id = EXCLUDED.family_id, created_by = EXCLUDED.created_by,
           expires_at = EXCLUDED.expires_at, used_at = NULL
           WHERE family_invites.used_at IS NOT NULL OR family_invites.expires_at < now()
         RETURNING code, expires_at`, [newPairingCode(), req.actor.familyId, req.actor.parentId, INVITE_TTL_HOURS]);
      if (rows.length) return reply.code(201).send({ code: rows[0].code, expiresAt: rows[0].expires_at });
    }
    return reply.code(503).send({ error: 'Спробуйте ще раз' });
  });
}
