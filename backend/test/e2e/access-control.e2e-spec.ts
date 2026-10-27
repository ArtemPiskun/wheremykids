import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { client, connectSocket, createHarness, type Harness } from './harness';

const device = () => ({ platform: 'android' as const, model: 'Pixel 8', appVersion: '0.1.0' });
const consent = { locationSharing: true, version: '2026-10' };

interface FamilySetup {
  http: ReturnType<typeof client>;
  parentToken: string;
  familyId: string;
  childId: string;
  childToken: string;
  childDeviceId: string;
  geofenceId: string;
  sosId: string;
}

/**
 * Two unrelated families. Every endpoint that takes a family, child, zone, SOS or device id
 * is called by the *other* family's parent and child and must not reveal or change anything.
 */
describe('Access control between families (e2e)', () => {
  let h: Harness;
  let a: FamilySetup;
  let b: FamilySetup;
  const sockets: Socket[] = [];

  async function setupFamily(tag: string): Promise<FamilySetup> {
    const http = client(h);
    const reg = await http
      .post('/v1/auth/register', { email: `${tag}@example.com`, password: 'very-secret-pass', displayName: `Батько ${tag}`, acceptPrivacyPolicy: true, device: device() })
      .expect(201);
    const parentToken = reg.body.accessToken as string;
    const familyId = (await http.post('/v1/families', { name: `Родина ${tag}` }, parentToken).expect(201)).body.id as string;
    const childId = (await http.post(`/v1/families/${familyId}/children`, { displayName: `Дитина ${tag}`, birthYear: 2012 }, parentToken).expect(201)).body.id as string;
    const code = (await http.post(`/v1/families/${familyId}/children/${childId}/invites`, {}, parentToken).expect(201)).body.code as string;
    const redeemed = await client(h).post('/v1/invites/redeem', { code, device: device(), consent }).expect(200);
    const geofenceId = (
      await http.post(`/v1/families/${familyId}/geofences`, { name: 'Дім', kind: 'home', lat: 50.45, lng: 30.52, radiusM: 150 }, parentToken).expect(201)
    ).body.id as string;
    const childToken = redeemed.body.accessToken as string;
    await http
      .post('/v1/locations/batch', { points: [{ clientId: randomUUID(), lat: 50.46, lng: 30.5, accuracy: 10, recordedAt: new Date().toISOString(), source: 'gps' }] }, childToken)
      .expect(200);
    const sosId = (await http.post('/v1/sos', { clientId: randomUUID(), lat: 50.46, lng: 30.5, accuracy: 10 }, childToken).expect(201)).body.id as string;
    return { http, parentToken, familyId, childId, childToken, childDeviceId: redeemed.body.deviceId, geofenceId, sosId };
  }

  beforeAll(async () => {
    h = await createHarness();
    a = await setupFamily('a');
    b = await setupFamily('b');
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await h.close();
  });

  it("hides family A's resources from family B's parent", async () => {
    const t = b.parentToken;
    const http = b.http;
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date().toISOString();
    const notFound: Array<[string, () => ReturnType<typeof http.get>]> = [
      ['family', () => http.get(`/v1/families/${a.familyId}`, t)],
      ['latest', () => http.get(`/v1/families/${a.familyId}/locations/latest`, t)],
      ['history', () => http.get(`/v1/children/${a.childId}/history?from=${from}&to=${to}`, t)],
      ['locate', () => http.post(`/v1/children/${a.childId}/locate`, {}, t)],
      ['geofences list', () => http.get(`/v1/families/${a.familyId}/geofences`, t)],
      ['geofence create', () => http.post(`/v1/families/${a.familyId}/geofences`, { name: 'X', kind: 'other', lat: 50, lng: 30, radiusM: 100 }, t)],
      ['geofence update', () => http.patch(`/v1/families/${a.familyId}/geofences/${a.geofenceId}`, { radiusM: 500 }, t)],
      ['geofence update via own family', () => http.patch(`/v1/families/${b.familyId}/geofences/${a.geofenceId}`, { radiusM: 500 }, t)],
      ['geofence delete', () => http.delete(`/v1/families/${a.familyId}/geofences/${a.geofenceId}`, t)],
      ['geofence delete via own family', () => http.delete(`/v1/families/${b.familyId}/geofences/${a.geofenceId}`, t)],
      ['geofence events', () => http.get(`/v1/families/${a.familyId}/geofence-events`, t)],
      ['sos list', () => http.get(`/v1/families/${a.familyId}/sos`, t)],
      ['sos ack', () => http.post(`/v1/sos/${a.sosId}/ack`, {}, t)],
      ['sos resolve', () => http.post(`/v1/sos/${a.sosId}/resolve`, {}, t)],
      ['add child', () => http.post(`/v1/families/${a.familyId}/children`, { displayName: 'Чужа', birthYear: 2015 }, t)],
      ['edit child', () => http.patch(`/v1/families/${a.familyId}/children/${a.childId}`, { displayName: 'Зламано' }, t)],
      ['remove child', () => http.delete(`/v1/families/${a.familyId}/children/${a.childId}`, t)],
      ['child invite', () => http.post(`/v1/families/${a.familyId}/children/${a.childId}/invites`, {}, t)],
      ['child invite via own family', () => http.post(`/v1/families/${b.familyId}/children/${a.childId}/invites`, {}, t)],
      ['parent invite', () => http.post(`/v1/families/${a.familyId}/parent-invites`, {}, t)],
      ['revoke child device', () => http.delete(`/v1/devices/${a.childDeviceId}`, t)],
    ];
    for (const [name, call] of notFound) {
      const res = await call();
      expect({ name, status: res.status }).toEqual({ name, status: 404 });
    }

    const families = await http.get('/v1/families', t).expect(200);
    expect(JSON.stringify(families.body)).not.toContain(a.familyId);
  });

  it("leaves family A's data untouched after B's attempts", async () => {
    const zones = await a.http.get(`/v1/families/${a.familyId}/geofences`, a.parentToken).expect(200);
    const zone = (zones.body.geofences ?? zones.body).find((g: { id: string }) => g.id === a.geofenceId);
    expect(zone.radiusM).toBe(150);
    const sos = await a.http.get(`/v1/families/${a.familyId}/sos`, a.parentToken).expect(200);
    expect(sos.body.alerts.find((s: { id: string }) => s.id === a.sosId).status).toBe('active');
    const fam = await a.http.get(`/v1/families/${a.familyId}`, a.parentToken).expect(200);
    expect(JSON.stringify(fam.body)).toContain(`Дитина a`);
  });

  it('keeps children out of parent endpoints and out of other families', async () => {
    const t = b.childToken;
    await b.http.get(`/v1/families/${b.familyId}`, t).expect(403);
    await b.http.get(`/v1/families/${b.familyId}/locations/latest`, t).expect(403);
    await b.http.post(`/v1/families/${b.familyId}/geofences`, { name: 'X', kind: 'other', lat: 50, lng: 30, radiusM: 100 }, t).expect(403);
    await b.http.post(`/v1/sos/${b.sosId}/ack`, {}, t).expect(403);
    // Child B cannot cancel child A's SOS.
    await b.http.post(`/v1/sos/${a.sosId}/cancel`, {}, t).expect(404);
    // A parent cannot post locations as if they were a child.
    await b.http
      .post('/v1/locations/batch', { points: [{ clientId: randomUUID(), lat: 1, lng: 1, accuracy: 5, recordedAt: new Date().toISOString(), source: 'gps' }] }, b.parentToken)
      .expect(403);
  });

  it("does not stream family A's events to family B's parent", async () => {
    const sa = await connectSocket(h.url, a.parentToken);
    const sb = await connectSocket(h.url, b.parentToken);
    sockets.push(sa, sb);
    const seenByB: string[] = [];
    sb.onAny((event: string, payload: { childId?: string }) => {
      if (payload?.childId === a.childId) seenByB.push(event);
    });
    const gotA = new Promise((resolve) => sa.once('location.updated', resolve));
    await a.http
      .post('/v1/locations/batch', { points: [{ clientId: randomUUID(), lat: 50.47, lng: 30.5, accuracy: 10, recordedAt: new Date().toISOString(), source: 'gps' }] }, a.childToken)
      .expect(200);
    await gotA;
    await new Promise((r) => setTimeout(r, 300));
    expect(seenByB).toEqual([]);
  });

  it('drops sockets with a forged token before they join any room', async () => {
    for (const token of ['not-a-jwt', '']) {
      const socket = io(`${h.url}/rt`, { transports: ['websocket'], auth: { token }, reconnection: false });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket was not dropped')), 3000);
        socket.on('disconnect', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      expect(socket.connected).toBe(false);
    }
  });
});
