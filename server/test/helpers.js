import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { memoryNotifier } from '../src/notify/push.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://moi:moi@localhost:5432/moi_test';

// Спрощені «області» для тестів: прямокутники lat/lon → uid
export const fakeResolver = {
  async resolve(lat, lon) {
    if (lat > 50.3 && lat < 50.6 && lon > 30.3 && lon < 30.8) return 31; // м. Київ
    if (lat > 49 && lat < 51.5 && lon > 29 && lon < 32) return 14; // Київська обл.
    if (lat > 49.5 && lat < 50.2 && lon > 23 && lon < 24.5) return 27; // Львівська обл.
    return null;
  },
};

export async function setup() {
  const pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  const notifier = memoryNotifier();
  const app = buildApp({ pool, notifier, oblastResolver: fakeResolver });
  await app.ready();
  const call = async (method, url, { token, body } = {}) => {
    const res = await app.inject({
      method, url, payload: body,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  return { pool, notifier, app, call, close: async () => { await app.close(); await pool.end(); } };
}

// Сім'я з одним батьком і прив'язаною дитиною, у обох є FCM-токени
export async function family(call, childName = 'Марійка') {
  const parent = (await call('POST', '/v1/parents', { body: { name: 'Олена' } })).body;
  await call('PUT', '/v1/devices/me/push-token', { token: parent.token, body: { fcmToken: `parent-fcm-${parent.parentId}` } });
  const child = (await call('POST', '/v1/children', { token: parent.token, body: { name: childName } })).body;
  const { code } = (await call('POST', `/v1/children/${child.id}/pairing-code`, { token: parent.token })).body;
  const paired = (await call('POST', '/v1/pair', { body: { code } })).body;
  await call('PUT', '/v1/devices/me/push-token', { token: paired.token, body: { fcmToken: `child-fcm-${child.id}` } });
  return { parent, child, childToken: paired.token, parentFcm: `parent-fcm-${parent.parentId}`, childFcm: `child-fcm-${child.id}` };
}

export const point = (lat, lon, extra = {}) => ({ lat, lon, accuracy: 10, recordedAt: new Date().toISOString(), ...extra });
