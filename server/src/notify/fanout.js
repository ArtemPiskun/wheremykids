// Запис події у стрічку сім'ї + пуш батькам (і за потреби дитині)

export async function parentTokens(db, familyId, exceptParentId = null) {
  const { rows } = await db.query(
    `SELECT d.fcm_token FROM devices d JOIN parents p ON p.id = d.parent_id
     WHERE p.family_id = $1 AND d.fcm_token IS NOT NULL AND ($2::uuid IS NULL OR p.id <> $2)`,
    [familyId, exceptParentId]);
  return rows.map((r) => r.fcm_token);
}

export async function childTokens(db, childId) {
  const { rows } = await db.query('SELECT fcm_token FROM devices WHERE child_id = $1 AND fcm_token IS NOT NULL', [childId]);
  return rows.map((r) => r.fcm_token);
}

// Надсилає пуш і забуває токени, які FCM назвав недійсними
export async function push(db, notifier, tokens, message) {
  const dead = (await notifier.send(tokens, message)) ?? [];
  if (dead.length) await db.query('UPDATE devices SET fcm_token = NULL WHERE fcm_token = ANY($1)', [dead]);
}

export async function recordEvent(db, { familyId, childId = null, type, data = {} }) {
  await db.query('INSERT INTO events(family_id, child_id, type, data) VALUES ($1, $2, $3, $4)', [familyId, childId, type, data]);
}

export async function notifyParents(db, notifier, child, type, message, data = {}) {
  await recordEvent(db, { familyId: child.family_id, childId: child.id, type, data });
  await push(db, notifier, await parentTokens(db, child.family_id), {
    ...message,
    data: { type, childId: child.id, ...data },
  });
}

export async function notifyChild(db, notifier, child, type, message, data = {}) {
  await push(db, notifier, await childTokens(db, child.id), { ...message, data: { type, ...data } });
}
