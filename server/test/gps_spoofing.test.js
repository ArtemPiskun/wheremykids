import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, family } from './helpers.js';
import { classifyPoint } from '../src/geo/plausibility.js';
import { applyStatus } from '../src/alerts/poller.js';
import { OBLASTS } from '../src/alerts/oblasts.js';

const T0 = Date.parse('2026-10-28T10:00:00Z');
const at = (min) => new Date(T0 + min * 60e3).toISOString();
const p = (lat, lon, min, extra = {}) => ({ lat, lon, accuracy: 15, recordedAt: at(min), ...extra });
const KYIV = [50.45, 30.52];
const LIMA = [-12.05, -77.04];

test('класифікація: Перу, підміна, стрибок, погана точність', () => {
  const last = p(...KYIV, 0);
  assert.deepEqual(classifyPoint(p(...LIMA, 1), last), { quality: 'rejected', reason: 'outside_ukraine' });
  assert.deepEqual(classifyPoint(p(...KYIV, 1, { mocked: true }), last), { quality: 'rejected', reason: 'mock' });
  // Київ → Львів (470 км) за 2 хв — неможливо
  assert.deepEqual(classifyPoint(p(49.84, 24.03, 2), last), { quality: 'rejected', reason: 'jump' });
  // ...а за 6 годин — нормально
  assert.equal(classifyPoint(p(49.84, 24.03, 360), last).quality, 'ok');
  assert.deepEqual(classifyPoint(p(...KYIV, 1, { accuracy: 5000 }), last), { quality: 'low', reason: 'inaccurate' });
  // Перша точка взагалі — лише перевірка меж
  assert.equal(classifyPoint(p(...KYIV, 0), null).quality, 'ok');
});

test('класифікація: кілька узгоджених точок на новому місці підтверджують переїзд', () => {
  const last = p(...KYIV, 0);
  const jumps = [p(49.84, 24.03, 1), p(49.841, 24.031, 3)];
  assert.equal(classifyPoint(p(49.842, 24.03, 2), last, jumps.slice(0, 1)).reason, 'jump');
  assert.deepEqual(classifyPoint(p(49.842, 24.03, 5), last, jumps), { quality: 'ok', reason: 'confirmed_move' });
});

let t;
before(async () => { t = await setup(); });
after(async () => { await t.close(); });
beforeEach(() => { t.notifier.sent.length = 0; });

const status = (map) => OBLASTS.map((o) => map[o.uid] ?? 'N').join('');

test('глушіння під час тривоги: місце, геозона й область не «стрибають» у Перу', async () => {
  const { call, pool } = t;
  await pool.query('DELETE FROM oblast_alerts');
  const f = await family(call);
  const send = (...points) => call('POST', '/v1/child/locations', { token: f.childToken, body: { points } });
  await call('POST', '/v1/geofences', { token: f.parent.token, body: { name: 'Школа', lat: KYIV[0], lon: KYIV[1], radiusM: 200 } });
  await send(p(...KYIV, 0, { battery: 60 }));
  await applyStatus(pool, t.notifier, status({}));

  // Тривога в Києві, і саме тоді GPS відправляє дитину в Ліму
  await applyStatus(pool, t.notifier, status({ 31: 'A' }));
  t.notifier.sent.length = 0;
  const res = await send(p(...LIMA, 5, { battery: 55, source: 'gps' }), p(...LIMA, 6, { battery: 54 }));
  assert.deepEqual(res.body, { updated: false, gpsUnreliable: true });
  assert.equal(t.notifier.sent.length, 0, 'жодних «вийшла зі школи» чи «переїхала»');

  let [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.deepEqual([kid.lastLocation.lat, kid.lastLocation.lon], KYIV);
  assert.equal(kid.oblast.uid, 31);
  assert.equal(kid.battery, 54, 'заряд оновлюється, навіть якщо координати підмінені');
  assert.ok(kid.gpsUnreliableSince);

  // Відбій все одно приходить за останньою надійною областю
  await applyStatus(pool, t.notifier, status({}));
  assert.equal(t.notifier.sent.find((m) => m.token === f.parentFcm).title, 'Відбій тривоги');

  // GPS повернувся — позначка зникає, у стрічці одна подія про ненадійний GPS
  await send(p(50.4501, 30.5201, 20));
  [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.equal(kid.gpsUnreliableSince, null);
  const events = (await call('GET', '/v1/events', { token: f.parent.token })).body.map((e) => e.type);
  assert.equal(events.filter((e) => e === 'gps_unreliable').length, 1);

  // Підмінені точки не потрапляють в історію маршруту
  const hist = (await call('GET', `/v1/children/${f.child.id}/locations?from=${at(-1)}&to=${at(30)}`, { token: f.parent.token })).body;
  assert.equal(hist.length, 2);
});

test('стрибок усередині України відкидається, а справжній переїзд підтверджується', async () => {
  const { call } = t;
  const f = await family(call);
  const send = (...points) => call('POST', '/v1/child/locations', { token: f.childToken, body: { points } });
  await send(p(...KYIV, 0));
  // Хибна точка в Харкові через хвилину
  assert.equal((await send(p(49.99, 36.23, 1))).body.updated, false);
  // Дитина справді в Харкові: кілька узгоджених точок протягом 4 хвилин
  await send(p(49.991, 36.231, 3));
  const res = await send(p(49.992, 36.232, 6));
  assert.equal(res.body.updated, true);
  const [kid] = (await call('GET', '/v1/children', { token: f.parent.token })).body;
  assert.equal(kid.lastLocation.lat, 49.992);
});

test('фіктивні координати (mock-провайдер) відкидаються', async () => {
  const { call } = t;
  const f = await family(call);
  await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [p(...KYIV, 0)] } });
  const res = await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [p(50.46, 30.53, 30, { mocked: true })] } });
  assert.equal(res.body.updated, false);
});
