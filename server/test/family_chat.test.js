import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, family, point } from './helpers.js';
import { mockAlertsSource } from '../src/alerts/source.js';

const mockSource = mockAlertsSource();
let t;
before(async () => { t = await setup({ mockSource, devToken: 'secret' }); });
after(async () => { await t.close(); });
beforeEach(() => { t.notifier.sent.length = 0; });

const sentTo = (token) => t.notifier.sent.filter((m) => m.token === token);

test('заглушка тривог: сторінка й керування лише з DEV_TOKEN', async () => {
  const { call } = t;
  assert.equal((await call('GET', '/dev/alerts')).status, 403);
  assert.equal((await call('POST', '/dev/alerts?token=wrong', { body: { uid: 31, status: 'A' } })).status, 403);
  const page = await call('GET', '/dev/alerts?token=secret');
  assert.equal(page.status, 200);
  assert.match(page.body, /Заглушка тривог/);
});

test('заглушка тривог: тривога в області дитини доходить до батьків і дитини', async () => {
  const { call } = t;
  const f = await family(call);
  await call('POST', '/v1/child/locations', { token: f.childToken, body: { points: [point(50.45, 30.52)] } }); // м. Київ
  // Перший застосований стан лише запам'ятовується
  await call('POST', '/dev/alerts?token=secret', { body: { clear: true } });
  t.notifier.sent.length = 0;

  const res = await call('POST', '/dev/alerts?token=secret', { body: { uid: 31, status: 'A' } });
  assert.deepEqual(res.body.changed, [{ uid: 31, before: 'N', status: 'A' }]);
  assert.equal(sentTo(f.parentFcm)[0].title, 'Повітряна тривога');
  assert.equal(sentTo(f.childFcm)[0].title, 'Повітряна тривога!');
  const kyiv = (await call('GET', '/v1/alerts')).body.find((a) => a.uid === 31);
  assert.equal(kyiv.status, 'A');

  t.notifier.sent.length = 0;
  await call('POST', '/dev/alerts?token=secret', { body: { clear: true } });
  assert.equal(sentTo(f.parentFcm)[0].title, 'Відбій тривоги');
});

test("другий батько: приєднання за кодом, бачить тих самих дітей", async () => {
  const { call } = t;
  const f = await family(call);
  const { code } = (await call('POST', '/v1/family/invites', { token: f.parent.token })).body;
  assert.match(code, /^\d{6}$/);
  const dad = await call('POST', '/v1/parents/join', { body: { name: 'Петро', code } });
  assert.equal(dad.status, 201);
  assert.equal(dad.body.familyId, f.parent.familyId);
  assert.equal((await call('POST', '/v1/parents/join', { body: { name: 'Хтось', code } })).status, 404);

  const kids = (await call('GET', '/v1/children', { token: dad.body.token })).body;
  assert.deepEqual(kids.map((k) => k.name), ['Марійка']);
  const fam = (await call('GET', '/v1/family', { token: dad.body.token })).body;
  assert.deepEqual(fam.parents.map((p) => [p.name, p.isMe]), [['Олена', false], ['Петро', true]]);

  // Події йдуть обом батькам
  await call('PUT', '/v1/devices/me/push-token', { token: dad.body.token, body: { fcmToken: 'dad-fcm-token-1' } });
  await call('POST', '/v1/child/sos', { token: f.childToken, body: {} });
  assert.equal(sentTo('dad-fcm-token-1')[0].title, 'SOS!');
  assert.equal(sentTo(f.parentFcm)[0].title, 'SOS!');
});

test('чат: батьки й дитина пишуть, пуші йдуть усім, крім відправника', async () => {
  const { call } = t;
  const f = await family(call);
  const { code } = (await call('POST', '/v1/family/invites', { token: f.parent.token })).body;
  const dad = (await call('POST', '/v1/parents/join', { body: { name: 'Петро', code } })).body;
  await call('PUT', '/v1/devices/me/push-token', { token: dad.token, body: { fcmToken: 'dad-fcm-token-2' } });

  const sent = await call('POST', `/v1/children/${f.child.id}/messages`, { token: f.parent.token, body: { text: 'Ти де?' } });
  assert.equal(sent.status, 201);
  assert.equal(sentTo(f.childFcm)[0].body, 'Ти де?');
  assert.equal(sentTo(f.childFcm)[0].title, 'Олена');
  assert.equal(sentTo('dad-fcm-token-2')[0].title, 'Олена → Марійка');
  assert.equal(sentTo(f.parentFcm).length, 0);

  t.notifier.sent.length = 0;
  await call('POST', '/v1/child/messages', { token: f.childToken, body: { text: 'В школі' } });
  assert.equal(sentTo(f.parentFcm)[0].title, 'Марійка');
  assert.equal(sentTo('dad-fcm-token-2')[0].body, 'В школі');

  const asChild = (await call('GET', '/v1/child/messages', { token: f.childToken })).body;
  assert.deepEqual(asChild.map((m) => [m.senderName, m.text, m.fromChild]), [['Олена', 'Ти де?', false], ['Марійка', 'В школі', true]]);
  const after = (await call('GET', `/v1/children/${f.child.id}/messages?after=${asChild[0].id}`, { token: dad.token })).body;
  assert.deepEqual(after.map((m) => m.text), ['В школі']);

  // Чужа сім'я не бачить розмову
  const other = await family(call, 'Остап');
  assert.equal((await call('GET', `/v1/children/${f.child.id}/messages`, { token: other.parent.token })).status, 404);
  assert.equal((await call('POST', '/v1/child/messages', { token: f.childToken, body: { text: '' } })).status, 400);
});
