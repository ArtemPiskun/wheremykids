import Fastify from 'fastify';
import { authHook, requireParent, requireChild, hashToken, newToken, newPairingCode } from './auth.js';
import { tx } from './db.js';
import { ingestLocations } from './services/locations.js';
import { notifyParents, notifyChild } from './notify/fanout.js';
import { msg } from './notify/messages.js';
import { OBLASTS, OBLAST_BY_UID } from './alerts/oblasts.js';
import { publicFamilyRoutes, parentFamilyRoutes } from './routes/family.js';
import { parentChatRoutes, childChatRoutes } from './routes/chat.js';
import { devRoutes } from './routes/dev.js';

const PAIRING_TTL_MIN = 15;
const MAX_POINTS_PER_BATCH = 500;

const lat = { type: 'number', minimum: -90, maximum: 90 };
const lon = { type: 'number', minimum: -180, maximum: 180 };
const name = { type: 'string', minLength: 1, maxLength: 60 };

function childView(c) {
  return {
    id: c.id,
    name: c.name,
    lastLocation: c.last_lat == null ? null : {
      lat: c.last_lat, lon: c.last_lon, accuracy: c.last_accuracy_m, at: c.last_seen_at,
    },
    battery: c.battery_pct,
    oblast: c.oblast_uid == null ? null : { uid: c.oblast_uid, title: OBLAST_BY_UID.get(c.oblast_uid)?.title },
    alertStatus: c.alert_status ?? 'N',
    inShelterAt: c.in_shelter_at,
    // Відколи координати недостовірні (глушіння/підміна GPS); lastLocation — останнє надійне місце
    gpsUnreliableSince: c.gps_unreliable_since,
    paired: c.paired ?? false,
  };
}

// deps: { pool, notifier, oblastResolver, mockSource? }
export function buildApp(deps, opts = {}) {
  const { pool, notifier } = deps;
  const app = Fastify({ logger: opts.logger ?? false });

  app.get('/healthz', async () => ({ ok: true }));

  // ---------- Реєстрація батька (MVP: анонімний обліковий запис на пристрої) ----------
  app.post('/v1/parents', {
    schema: { body: { type: 'object', required: ['name'], properties: { name } } },
  }, async (req, reply) => {
    const token = newToken();
    const result = await tx(pool, async (db) => {
      const { rows: [family] } = await db.query('INSERT INTO families DEFAULT VALUES RETURNING id');
      const { rows: [parent] } = await db.query(
        'INSERT INTO parents(family_id, name) VALUES ($1, $2) RETURNING id', [family.id, req.body.name]);
      await db.query('INSERT INTO devices(parent_id, token_hash) VALUES ($1, $2)', [parent.id, hashToken(token)]);
      return { parentId: parent.id, familyId: family.id };
    });
    return reply.code(201).send({ token, ...result });
  });

  // ---------- Прив'язка пристрою дитини за кодом ----------
  app.post('/v1/pair', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } } } },
  }, async (req, reply) => {
    const token = newToken();
    const child = await tx(pool, async (db) => {
      const { rows } = await db.query(
        `UPDATE pairing_codes SET used_at = now()
         WHERE code = $1 AND used_at IS NULL AND expires_at > now() RETURNING child_id`, [req.body.code]);
      if (!rows.length) return null;
      const { rows: [c] } = await db.query('SELECT id, name FROM children WHERE id = $1', [rows[0].child_id]);
      await db.query('INSERT INTO devices(child_id, token_hash) VALUES ($1, $2)', [c.id, hashToken(token)]);
      return c;
    });
    if (!child) return reply.code(404).send({ error: 'Код недійсний або прострочений' });
    return reply.code(201).send({ token, childId: child.id, childName: child.name });
  });

  publicFamilyRoutes(app, deps);
  if (deps.mockSource) devRoutes(app, { ...deps, devToken: opts.devToken });

  // Публічний довідник: поточний стан тривог по областях
  app.get('/v1/alerts', async () => {
    const { rows } = await pool.query('SELECT oblast_uid, status, changed_at FROM oblast_alerts');
    const byUid = new Map(rows.map((r) => [r.oblast_uid, r]));
    return OBLASTS.map((o) => ({
      uid: o.uid, title: o.title,
      status: byUid.get(o.uid)?.status ?? 'N',
      changedAt: byUid.get(o.uid)?.changed_at ?? null,
    }));
  });

  // ---------- Далі — лише з токеном ----------
  app.register(async (authed) => {
    authed.addHook('preHandler', authHook(pool));

    authed.put('/v1/devices/me/push-token', {
      schema: { body: { type: 'object', required: ['fcmToken'], properties: { fcmToken: { type: 'string', minLength: 10, maxLength: 4096 } } } },
    }, async (req) => {
      await pool.query('UPDATE devices SET fcm_token = $2 WHERE id = $1', [req.actor.deviceId, req.body.fcmToken]);
      return { ok: true };
    });

    // ===== Батьки =====
    authed.register(async (p) => {
      p.addHook('preHandler', requireParent);
      parentFamilyRoutes(p, deps);
      parentChatRoutes(p, deps);

      const ownChild = async (req, reply) => {
        const { rows } = await pool.query('SELECT * FROM children WHERE id = $1 AND family_id = $2', [req.params.id, req.actor.familyId]);
        if (!rows.length) { reply.code(404).send({ error: 'Дитину не знайдено' }); return null; }
        return rows[0];
      };
      const idParam = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };

      p.get('/v1/children', async (req) => {
        const { rows } = await pool.query(
          `SELECT c.*, a.status AS alert_status,
                  EXISTS (SELECT 1 FROM devices d WHERE d.child_id = c.id) AS paired
           FROM children c LEFT JOIN oblast_alerts a ON a.oblast_uid = c.oblast_uid
           WHERE c.family_id = $1 ORDER BY c.created_at`, [req.actor.familyId]);
        return rows.map(childView);
      });

      p.post('/v1/children', {
        schema: { body: { type: 'object', required: ['name'], properties: { name } } },
      }, async (req, reply) => {
        const { rows: [c] } = await pool.query(
          'INSERT INTO children(family_id, name) VALUES ($1, $2) RETURNING *', [req.actor.familyId, req.body.name]);
        return reply.code(201).send(childView(c));
      });

      p.delete('/v1/children/:id', { schema: { params: idParam } }, async (req, reply) => {
        const child = await ownChild(req, reply);
        if (!child) return;
        await pool.query('DELETE FROM children WHERE id = $1', [child.id]);
        return reply.code(204).send();
      });

      p.post('/v1/children/:id/pairing-code', { schema: { params: idParam } }, async (req, reply) => {
        const child = await ownChild(req, reply);
        if (!child) return;
        // Рідкісний збіг з чинним кодом — просто пробуємо ще раз
        for (let i = 0; i < 5; i++) {
          const code = newPairingCode();
          const { rows } = await pool.query(
            `INSERT INTO pairing_codes(code, child_id, expires_at)
             VALUES ($1, $2, now() + make_interval(mins => $3))
             ON CONFLICT (code) DO UPDATE SET child_id = EXCLUDED.child_id, expires_at = EXCLUDED.expires_at, used_at = NULL
               WHERE pairing_codes.used_at IS NOT NULL OR pairing_codes.expires_at < now()
             RETURNING code, expires_at`, [code, child.id, PAIRING_TTL_MIN]);
          if (rows.length) return reply.code(201).send({ code: rows[0].code, expiresAt: rows[0].expires_at });
        }
        return reply.code(503).send({ error: 'Спробуйте ще раз' });
      });

      p.get('/v1/children/:id/locations', {
        schema: {
          params: idParam,
          querystring: { type: 'object', properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' } } },
        },
      }, async (req, reply) => {
        const child = await ownChild(req, reply);
        if (!child) return;
        const to = req.query.to ?? new Date().toISOString();
        const from = req.query.from ?? new Date(Date.parse(to) - 24 * 3600e3).toISOString();
        const { rows } = await pool.query(
          `SELECT lat, lon, accuracy_m AS accuracy, battery_pct AS battery, recorded_at AS "recordedAt"
           FROM locations WHERE child_id = $1 AND quality = 'ok' AND recorded_at BETWEEN $2 AND $3 ORDER BY recorded_at LIMIT 5000`,
          [child.id, from, to]);
        return rows;
      });

      // Гучний сигнал на телефоні дитини (навіть у беззвучному режимі)
      p.post('/v1/children/:id/ring', { schema: { params: idParam } }, async (req, reply) => {
        const child = await ownChild(req, reply);
        if (!child) return;
        await notifyChild(pool, notifier, child, 'ring', {}, {});
        return { ok: true };
      });

      p.get('/v1/geofences', async (req) => {
        const { rows } = await pool.query(
          'SELECT id, name, lat, lon, radius_m AS "radiusM" FROM geofences WHERE family_id = $1 ORDER BY created_at', [req.actor.familyId]);
        return rows;
      });

      p.post('/v1/geofences', {
        schema: {
          body: {
            type: 'object', required: ['name', 'lat', 'lon', 'radiusM'],
            properties: { name, lat, lon, radiusM: { type: 'integer', minimum: 50, maximum: 5000 } },
          },
        },
      }, async (req, reply) => {
        const { name: n, lat: la, lon: lo, radiusM } = req.body;
        const { rows: [g] } = await pool.query(
          `INSERT INTO geofences(family_id, name, lat, lon, radius_m) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, lat, lon, radius_m AS "radiusM"`, [req.actor.familyId, n, la, lo, radiusM]);
        return reply.code(201).send(g);
      });

      p.delete('/v1/geofences/:id', { schema: { params: idParam } }, async (req, reply) => {
        const { rowCount } = await pool.query('DELETE FROM geofences WHERE id = $1 AND family_id = $2', [req.params.id, req.actor.familyId]);
        return rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Геозону не знайдено' });
      });

      p.get('/v1/events', {
        schema: { querystring: { type: 'object', properties: { before: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
      }, async (req) => {
        const { rows } = await pool.query(
          `SELECT e.id, e.type, e.data, e.created_at AS "createdAt", e.child_id AS "childId", c.name AS "childName"
           FROM events e LEFT JOIN children c ON c.id = e.child_id
           WHERE e.family_id = $1 AND ($2::bigint IS NULL OR e.id < $2)
           ORDER BY e.id DESC LIMIT $3`, [req.actor.familyId, req.query.before ?? null, req.query.limit ?? 50]);
        return rows;
      });
    });

    // ===== Пристрій дитини =====
    authed.register(async (c) => {
      c.addHook('preHandler', requireChild);
      childChatRoutes(c, deps);
      const loadChild = async (req) => (await pool.query('SELECT * FROM children WHERE id = $1', [req.actor.childId])).rows[0];

      c.post('/v1/child/locations', {
        schema: {
          body: {
            type: 'object', required: ['points'],
            properties: {
              points: {
                type: 'array', minItems: 1, maxItems: MAX_POINTS_PER_BATCH,
                items: {
                  type: 'object', required: ['lat', 'lon', 'recordedAt'],
                  properties: {
                    lat, lon,
                    accuracy: { type: 'number', minimum: 0 },
                    battery: { type: 'integer', minimum: 0, maximum: 100 },
                    recordedAt: { type: 'string', format: 'date-time' },
                    // gps — супутники, network — вишки й Wi-Fi (запасний варіант при глушінні)
                    source: { type: 'string', enum: ['gps', 'network', 'fused'] },
                    // Android позначає координати від «фіктивного» провайдера
                    mocked: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      }, async (req) => ingestLocations(deps, req.actor.childId, req.body.points));

      c.post('/v1/child/sos', {
        schema: { body: { type: 'object', properties: { lat, lon } } },
      }, async (req) => {
        const child = await loadChild(req);
        const la = req.body?.lat ?? child.last_lat;
        const lo = req.body?.lon ?? child.last_lon;
        await notifyParents(pool, notifier, child, 'sos', msg.sos(child), { lat: la ?? '', lon: lo ?? '' });
        return { ok: true };
      });

      c.post('/v1/child/shelter', async (req) => {
        const child = await loadChild(req);
        await pool.query('UPDATE children SET in_shelter_at = now() WHERE id = $1', [child.id]);
        await notifyParents(pool, notifier, child, 'shelter', msg.shelter(child));
        return { ok: true };
      });

      c.get('/v1/child/me', async (req) => {
        const { rows: [child] } = await pool.query(
          `SELECT c.*, a.status AS alert_status, true AS paired FROM children c
           LEFT JOIN oblast_alerts a ON a.oblast_uid = c.oblast_uid WHERE c.id = $1`, [req.actor.childId]);
        return childView(child);
      });
    });
  });

  return app;
}
