import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, family, point } from './helpers.js';
import { applyStatus } from '../src/alerts/poller.js';
import { OBLASTS } from '../src/alerts/oblasts.js';

// Рядок статусу, де задані області мають вказаний стан, решта — N
const status = (map = {}) => OBLASTS.map((o) => map[o.uid] ?? 'N').join('');

let t;
before(async () => { t = await setup(); });
after(async () => { await t.close(); });
beforeEach(() => { t.notifier.sent.length = 0; });

const sentTo = (token) => t.notifier.sent.filter((m) => m.token === token);

test("прив'язка: код одноразовий, сторонні коди не працюють", async () => {
  const { call } = t;
  const parent = (await call('POST', '/v1/parents', { body: { name: 'Андрій' } })).body;
  const child = (await call('POST', '/v1/children', { token: parent.token, body: { name: 'Тарас' } })).body;
  const { code } = (await call('POST', `/v1/children/${child.id}/pairing-code`, { token: parent.token })).body;
  assert.match(code, /^\d{6}$/);
  const first = await call('POST', '/v1/pair', { body: { code } });
  assert.equal(first.status, 201);
  assert.equal(first.body.childName, 'Тарас');
  assert.equal((await call('POST', '/v1/pair', { body: { code } })).status, 404);
  const kids = (await call('GET', '/v1/children', { token: parent.token })).body;
  assert.equal(kids[0].paired, true);
});

test('доступ: чужа дитина недоступна, дитина не викликає батьківські методи', async () => {
  const { call } = t;
  const a = await family(call);
  const b = await family(call, 'Остап');
  assert.equal((await call('GET', `/v1/children/${b.child.id}/locations`, { token: a.parent.token })).status, 404);
  assert.equal((await call('GET', '/v1/children', { token: a.childToken })).status, 403);
  assert.equal((await call('POST', '/v1/child/sos', { token: a.parent.token, body: {} })).status, 403);
  assert.equal((await call('GET', '/v1/children')).status, 401);
});

test('точки: історія, останнє місце, область; старі точки з буфера не перетирають нові', async () => {
  const { call } = t;
  const f = await family(call);
  const now = Date.now();
  const res = await call('POST', '/v1/child/locations', {
    token: f.childToken,
    body: { points: [point(50.45, 30.52, { recordedAt: new Date(now - 2 * 3600e3).toISOString(), battery: 80 }), point(50.0, 30.0, { recordedAt: new Date(now).toISOString(), battery: 79 })] },
  });
  assert.equal(res.status, 200);
  const late = await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(49.8, 24.0, { recordedAt: new Date(now - 120e3).toISOString() })] } });
  assert.equal(late.body.updated, false);
  const [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.deepEqual([kid.lastLocation.lat, kid.lastLocation.lon, kid.battery, kid.oblast.uid], [50.0, 30.0, 79, 14]);
  const hist = (await call('GET', `/v1/children/${f.child.id}/locations?from=${new Date(now - 3 * 3600e3).toISOString()}`, { token: f.parent.token })).body;
  assert.equal(hist.length, 3);
});

test('тривоги: перший запуск мовчить, далі пуш батькам і дитині, укриття, відбій', async () => {
  const { call, pool } = t;
  await pool.query('DELETE FROM oblast_alerts');
  const f = await family(call);
  await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(50.45, 30.52)] } }); // м. Київ

  // Перший опит лише фіксує стан, навіть якщо тривога вже триває
  await applyStatus(pool, t.notifier, status({ 27: 'A' }));
  assert.equal(t.notifier.sent.length, 0);

  const changed = await applyStatus(pool, t.notifier, status({ 27: 'A', 31: 'A' }));
  assert.deepEqual(changed, [{ uid: 31, before: 'N', status: 'A' }]);
  assert.equal(sentTo(f.parentFcm)[0].title, 'Повітряна тривога');
  assert.match(sentTo(f.parentFcm)[0].body, /м\. Київ.*Марійка/);
  assert.equal(sentTo(f.childFcm)[0].title, 'Повітряна тривога!');

  // Повторний опит без змін — без нових пушів
  t.notifier.sent.length = 0;
  await applyStatus(pool, t.notifier, status({ 27: 'A', 31: 'A' }));
  assert.equal(t.notifier.sent.length, 0);

  await call('POST', '/v1/child/shelter', { token: f.childToken });
  assert.equal(sentTo(f.parentFcm)[0].body, 'Марійка: «Я в укритті».');
  let [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.equal(kid.alertStatus, 'A');
  assert.ok(kid.inShelterAt);

  t.notifier.sent.length = 0;
  await applyStatus(pool, t.notifier, status({ 27: 'A' }));
  assert.equal(sentTo(f.parentFcm)[0].title, 'Відбій тривоги');
  assert.equal(sentTo(f.childFcm)[0].title, 'Відбій тривоги');
  [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.equal(kid.inShelterAt, null);

  // Дитина переїжджає у Львівську, де тривога вже триває
  t.notifier.sent.length = 0;
  await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(49.84, 24.03, { recordedAt: new Date(Date.now() + 30 * 24 * 3600e3).toISOString() })] } });
  assert.equal(sentTo(f.parentFcm)[0].title, 'Дитина в зоні тривоги');
  assert.equal(sentTo(f.childFcm)[0].title, 'Повітряна тривога!');

  const events = (await call('GET', '/v1/events', { token: f.parent.token })).body.map((e) => e.type);
  assert.deepEqual(events, ['moved_into_alert', 'alert_end', 'shelter', 'alert_start']);
});

test('геозони: вхід і вихід з гістерезисом, перша точка — без пуша', async () => {
  const { call } = t;
  const f = await family(call);
  await call('POST', '/v1/geofences', { token: f.parent.token, body: { name: 'Школа', lat: 50.45, lon: 30.52, radiusM: 200 } });
  const send = (lat, lon) => call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(lat, lon)] } });
  await send(50.46, 30.52); // ~1.1 км — поза зоною, початковий стан
  assert.equal(sentTo(f.parentFcm).length, 0);
  await send(50.4505, 30.52); // ~55 м — у зоні
  assert.equal(sentTo(f.parentFcm).at(-1).body, 'Марійка прибув(-ла): Школа.');
  await send(50.4519, 30.52); // ~211 м — у межах похибки, ще «в зоні»
  assert.equal(sentTo(f.parentFcm).length, 1);
  await send(50.4525, 30.52); // ~278 м — вийшла
  assert.equal(sentTo(f.parentFcm).at(-1).body, 'Марійка залишив(-ла): Школа.');
});

test('заряд: одне сповіщення за розряд, скидається після зарядки', async () => {
  const { call } = t;
  const f = await family(call);
  const send = (battery) => call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(50.0, 30.0, { battery })] } });
  await send(14);
  await send(10);
  assert.equal(sentTo(f.parentFcm).filter((m) => m.data.type === 'low_battery').length, 1);
  await send(90);
  await send(12);
  assert.equal(sentTo(f.parentFcm).filter((m) => m.data.type === 'low_battery').length, 2);
});

test('SOS і гучний сигнал', async () => {
  const { call } = t;
  const f = await family(call);
  await call('POST', '/v1/child/sos', { token: f.childToken, body: { lat: 50.1, lon: 30.1 } });
  const sos = sentTo(f.parentFcm)[0];
  assert.equal(sos.title, 'SOS!');
  assert.deepEqual([sos.data.lat, sos.data.lon], [50.1, 30.1]);
  await call('POST', `/v1/children/${f.child.id}/ring`, { token: f.parent.token });
  assert.equal(sentTo(f.childFcm)[0].data.type, 'ring');
});

test('геозона: перевірка радіуса', async () => {
  const { call } = t;
  const f = await family(call);
  const res = await call('POST', '/v1/geofences', { token: f.parent.token, body: { name: 'Дім', lat: 50, lon: 30, radiusM: 10 } });
  assert.equal(res.status, 400);
});

test('недійсний FCM-токен забувається після відмови FCM', async () => {
  const { call, pool } = t;
  const f = await family(call);
  t.notifier.dead.add(f.parentFcm);
  await call('POST', '/v1/child/sos', { token: f.childToken, body: {} });
  const { rows } = await pool.query('SELECT fcm_token FROM devices WHERE parent_id = $1', [f.parent.parentId]);
  assert.equal(rows[0].fcm_token, null);
  t.notifier.dead.clear();
});
