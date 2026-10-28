import { push, parentTokens, childTokens } from '../notify/fanout.js';

const PAGE = 100;
const textBody = {
  type: 'object', required: ['text'],
  properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
};
const pageQuery = {
  type: 'object',
  properties: { after: { type: 'integer', minimum: 0 }, before: { type: 'integer', minimum: 1 } },
};

// Розмова батьків з дитиною: одна на кожну дитину, бачать усі батьки сім'ї
async function listMessages(pool, childId, { after, before }) {
  const { rows } = await pool.query(
    `SELECT m.id, m.text, m.from_child AS "fromChild", m.created_at AS "createdAt",
            CASE WHEN m.from_child THEN c.name ELSE p.name END AS "senderName",
            m.sender_parent_id AS "senderParentId"
     FROM messages m JOIN children c ON c.id = m.child_id
     LEFT JOIN parents p ON p.id = m.sender_parent_id
     WHERE m.child_id = $1 AND ($2::bigint IS NULL OR m.id > $2) AND ($3::bigint IS NULL OR m.id < $3)
     ORDER BY m.id DESC LIMIT ${PAGE}`, [childId, after ?? null, before ?? null]);
  return rows.reverse();
}

const preview = (text) => (text.length > 200 ? `${text.slice(0, 197)}…` : text);

export function parentChatRoutes(p, { pool, notifier }) {
  const ownChild = async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM children WHERE id = $1 AND family_id = $2', [req.params.id, req.actor.familyId]);
    if (!rows.length) { reply.code(404).send({ error: 'Дитину не знайдено' }); return null; }
    return rows[0];
  };
  const params = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };

  p.get('/v1/children/:id/messages', { schema: { params, querystring: pageQuery } }, async (req, reply) => {
    const child = await ownChild(req, reply);
    if (!child) return;
    return listMessages(pool, child.id, req.query);
  });

  p.post('/v1/children/:id/messages', { schema: { params, body: textBody } }, async (req, reply) => {
    const child = await ownChild(req, reply);
    if (!child) return;
    const { rows: [m] } = await pool.query(
      `INSERT INTO messages(child_id, sender_parent_id, from_child, text) VALUES ($1, $2, false, $3)
       RETURNING id, created_at`, [child.id, req.actor.parentId, req.body.text]);
    const { rows: [me] } = await pool.query('SELECT name FROM parents WHERE id = $1', [req.actor.parentId]);
    const message = { title: me.name, body: preview(req.body.text), data: { type: 'chat', childId: child.id } };
    // Дитині й іншим батькам; відправник бачить своє повідомлення й так
    await push(pool, notifier, await childTokens(pool, child.id), message);
    await push(pool, notifier, await parentTokens(pool, child.family_id, req.actor.parentId),
      { ...message, title: `${me.name} → ${child.name}` });
    return reply.code(201).send({ id: Number(m.id), createdAt: m.created_at });
  });
}

export function childChatRoutes(c, { pool, notifier }) {
  c.get('/v1/child/messages', { schema: { querystring: pageQuery } }, async (req) => listMessages(pool, req.actor.childId, req.query));

  c.post('/v1/child/messages', { schema: { body: textBody } }, async (req, reply) => {
    const { rows: [child] } = await pool.query('SELECT * FROM children WHERE id = $1', [req.actor.childId]);
    const { rows: [m] } = await pool.query(
      `INSERT INTO messages(child_id, from_child, text) VALUES ($1, true, $2) RETURNING id, created_at`,
      [child.id, req.body.text]);
    await push(pool, notifier, await parentTokens(pool, child.family_id),
      { title: child.name, body: preview(req.body.text), data: { type: 'chat', childId: child.id } });
    return reply.code(201).send({ id: Number(m.id), createdAt: m.created_at });
  });
}
