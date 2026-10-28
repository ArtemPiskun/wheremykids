// Запис події у стрічку сім'ї + пуш батькам (і за потреби дитині)

export async function parentTokens(db, familyId) {
  const { rows } = await db.query(
    `SELECT d.fcm_token FROM devices d JOIN parents p ON p.id = d.parent_id
     WHERE p.family_id = $1 AND d.fcm_token IS NOT NULL`, [familyId]);
  return rows.map((r) => r.fcm_token);
}

export async function childTokens(db, childId) {
  const { rows } = await db.query('SELECT fcm_token FROM devices WHERE child_id = $1 AND fcm_token IS NOT NULL', [childId]);
  return rows.map((r) => r.fcm_token);
}

export async function recordEvent(db, { familyId, childId = null, type, data = {} }) {
  await db.query('INSERT INTO events(family_id, child_id, type, data) VALUES ($1, $2, $3, $4)', [familyId, childId, type, data]);
}

export async function notifyParents(db, notifier, child, type, message, data = {}) {
  await recordEvent(db, { familyId: child.family_id, childId: child.id, type, data });
  await notifier.send(await parentTokens(db, child.family_id), {
    ...message,
    data: { type, childId: child.id, ...data },
  });
}

export async function notifyChild(db, notifier, child, type, message, data = {}) {
  await notifier.send(await childTokens(db, child.id), { ...message, data: { type, ...data } });
}
