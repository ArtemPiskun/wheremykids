import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import { client, connectSocket, createHarness, nextEvent, waitFor, type Harness } from './harness';

const HOME = { lat: 50.4501, lng: 30.5234 };
const FAR = { lat: 50.4601, lng: 30.5234 }; // ~1.1 km north

const device = (platform: 'android' | 'ios' = 'android') => ({ platform, model: 'Test', appVersion: '0.1.0', pushToken: `tok-${randomUUID()}` });
const point = (pos: { lat: number; lng: number }, minutesAgo = 0, accuracy = 10) => ({
  clientId: randomUUID(),
  lat: pos.lat,
  lng: pos.lng,
  accuracy,
  recordedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  source: 'gps',
});

describe('Family flow (e2e)', () => {
  let h: Harness;
  const sockets: Socket[] = [];

  let parent: { accessToken: string; refreshToken: string; user: { id: string } };
  let familyId: string;
  let childId: string;
  let child: { accessToken: string; deviceId: string };
  const parentHttp = () => client(h, '10.1.0.1');

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await h.close();
  });

  it('registers a parent and rejects duplicate emails', async () => {
    const res = await parentHttp()
      .post('/v1/auth/register', {
        email: 'Mama@Example.com',
        password: 'very-secret-pass',
        displayName: 'Мама',
        acceptPrivacyPolicy: true,
        device: device(),
      })
      .expect(201);
    parent = res.body;
    expect(res.body.user.email).toBe('mama@example.com');

    const dup = await parentHttp()
      .post('/v1/auth/register', { email: 'mama@example.com', password: 'very-secret-pass', displayName: 'X', acceptPrivacyPolicy: true, device: device() })
      .expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input and hides unknown fields', async () => {
    const res = await parentHttp().post('/v1/auth/register', { email: 'not-an-email', password: 'short', displayName: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    await parentHttp().post('/v1/families', { name: 'Сім’я', isAdmin: true }, parent.accessToken).expect(400);
  });

  it('creates a family and a child, and enforces the free plan child limit', async () => {
    const fam = await parentHttp().post('/v1/families', { name: 'Коваленки' }, parent.accessToken).expect(201);
    familyId = fam.body.id;
    expect(fam.body.myRole).toBe('owner');
    expect(fam.body.limits.maxChildren).toBe(1);

    const kid = await parentHttp()
      .post(`/v1/families/${familyId}/children`, { displayName: 'Олена', birthYear: 2016, phone: '067 123 45 67', avatar: 'fox' }, parent.accessToken)
      .expect(201);
    childId = kid.body.id;
    expect(kid.body.phone).toBe('+380671234567');

    const second = await parentHttp().post(`/v1/families/${familyId}/children`, { displayName: 'Марко' }, parent.accessToken).expect(402);
    expect(second.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('redeems a child invite once, accepting a code typed with dashes and look-alike letters', async () => {
    const invite = await parentHttp().post(`/v1/families/${familyId}/children/${childId}/invites`, {}, parent.accessToken).expect(201);
    expect(invite.body.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(invite.body.qrPayload).toContain('demoidity://invite?c=');

    const parentSocket = await connectSocket(h.url, parent.accessToken);
    sockets.push(parentSocket);
    const joined = nextEvent(parentSocket, 'child.joined');

    const typed = invite.body.code.toLowerCase().replace(/0/g, 'o');
    const kidHttp = client(h);
    const res = await kidHttp
      .post('/v1/invites/redeem', { code: typed, device: device('ios'), consent: { locationSharing: true, version: '2026-10' } })
      .expect(200);
    child = res.body;
    expect(res.body.user.role).toBe('child');
    expect(res.body.familyId).toBe(familyId);
    expect((await joined).childId).toBe(childId);

    const again = await kidHttp
      .post('/v1/invites/redeem', { code: invite.body.code, device: device(), consent: { locationSharing: true, version: '2026-10' } })
      .expect(400);
    expect(again.body.error.code).toBe('INVITE_INVALID');

    await waitFor(() => h.push.sentMessages.find((m) => m.data.type === 'child_joined'));
  });

  it('requires explicit consent from the child', async () => {
    const res = await client(h)
      .post('/v1/invites/redeem', { code: 'AAAA-BBBB', device: device(), consent: { locationSharing: false, version: '2026-10' } })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('shows the child who can see their location', async () => {
    const res = await client(h).get('/v1/child/me', child.accessToken).expect(200);
    expect(res.body.parents).toEqual([{ id: parent.user.id, displayName: 'Мама' }]);
    expect(res.body.canPause).toBe(false);
  });

  it('ingests a batch idempotently and pushes the newest point to parents in real time', async () => {
    const parentSocket = sockets[0];
    const updated = nextEvent(parentSocket, 'location.updated');
    const batch = { points: [point(HOME, 3), point(HOME, 2), point(HOME, 1)], battery: { level: 64, charging: false } };

    const first = await client(h).post('/v1/locations/batch', batch, child.accessToken).expect(200);
    expect(first.body).toMatchObject({ accepted: 3, duplicates: 0, rejected: 0, paused: false });
    const evt = await updated;
    expect(evt).toMatchObject({ childId, lat: HOME.lat, lng: HOME.lng, battery: 64 });
    expect(new Date(evt.recordedAt).getTime()).toBe(new Date(batch.points[2].recordedAt).getTime());

    // Network dropped the response; the device resends the same points.
    const resend = await client(h).post('/v1/locations/batch', batch, child.accessToken).expect(200);
    expect(resend.body).toMatchObject({ accepted: 0, duplicates: 3 });

    const stale = await client(h)
      .post('/v1/locations/batch', { points: [{ ...point(HOME), recordedAt: new Date(Date.now() + 3_600_000).toISOString() }] }, child.accessToken)
      .expect(200);
    expect(stale.body.rejected).toBe(1);
  });

  it('returns latest locations and statuses to parents only', async () => {
    const res = await parentHttp().get(`/v1/families/${familyId}/locations/latest`, parent.accessToken).expect(200);
    expect(res.body.children[0]).toMatchObject({ childId, status: 'online', battery: 64 });
    expect(res.body.children[0].location.lat).toBe(HOME.lat);

    await client(h).get(`/v1/families/${familyId}/locations/latest`, child.accessToken).expect(403);
  });

  it('stores coordinates encrypted at rest', async () => {
    const row = await h.db.selectFrom('locations').select(['payload', 'key_version']).where('child_id', '=', childId).executeTakeFirstOrThrow();
    expect(row.key_version).toBe(1);
    expect(row.payload.toString('utf8')).not.toContain(String(HOME.lat));
  });

  it('fires one exit event with hysteresis and notifies parents', async () => {
    const zone = await parentHttp()
      .post(`/v1/families/${familyId}/geofences`, { name: 'Дім', kind: 'home', lat: HOME.lat, lng: HOME.lng, radiusM: 150 }, parent.accessToken)
      .expect(201);
    const second = await parentHttp()
      .post(`/v1/families/${familyId}/geofences`, { name: 'Школа', kind: 'school', lat: FAR.lat, lng: FAR.lng, radiusM: 150 }, parent.accessToken)
      .expect(402);
    expect(second.body.error.code).toBe('PLAN_LIMIT_REACHED');

    const transition = nextEvent(sockets[0], 'geofence.transition');
    // A vague fix far away is not enough on its own; the second one confirms the exit.
    await client(h).post('/v1/locations/batch', { points: [point(FAR, 0.5, 60)] }, child.accessToken).expect(200);
    await client(h).post('/v1/locations/batch', { points: [point(FAR, 0, 60)] }, child.accessToken).expect(200);
    const evt = await transition;
    expect(evt).toMatchObject({ childId, geofenceId: zone.body.id, kind: 'exit', name: 'Дім' });

    const push = await waitFor(() => h.push.sentMessages.find((m) => m.data.type === 'geofence_exit'));
    expect(push.notification?.title).toBe('Олена — поза зоною «Дім»');
    expect(push.channel).toBe('zones');

    const events = await parentHttp().get(`/v1/families/${familyId}/geofence-events`, parent.accessToken).expect(200);
    expect(events.body.events).toHaveLength(1);
  });

  it('returns the route for a period and audits the access', async () => {
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const res = await parentHttp().get(`/v1/children/${childId}/history?from=${from}&to=${to}&simplify=false`, parent.accessToken).expect(200);
    expect(res.body.points).toHaveLength(5);
    expect(res.body.historyDays).toBe(1);
    const audit = await h.db.selectFrom('audit_log').select('action').where('action', '=', 'history.viewed').execute();
    expect(audit.length).toBeGreaterThan(0);
  });

  it('does not leak one family’s child to another parent', async () => {
    const strangerHttp = client(h);
    const stranger = await strangerHttp
      .post('/v1/auth/register', { email: 'stranger@example.com', password: 'very-secret-pass', displayName: 'Чужий', acceptPrivacyPolicy: true, device: device() })
      .expect(201);
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date().toISOString();
    const res = await strangerHttp.get(`/v1/children/${childId}/history?from=${from}&to=${to}`, stranger.body.accessToken).expect(404);
    expect(res.body.error.code).toBe('CHILD_NOT_FOUND');
    await strangerHttp.get(`/v1/families/${familyId}`, stranger.body.accessToken).expect(404);
    await strangerHttp.post(`/v1/children/${childId}/locate`, {}, stranger.body.accessToken).expect(404);
  });

  it('runs the SOS flow: raise, critical push, acknowledge, child sees who responded', async () => {
    const childSocket = await connectSocket(h.url, child.accessToken);
    sockets.push(childSocket);
    const raised = nextEvent(sockets[0], 'sos.raised');
    const clientId = randomUUID();
    const sosBody = { clientId, lat: FAR.lat, lng: FAR.lng, accuracy: 8, battery: { level: 12 } };

    const res = await client(h).post('/v1/sos', sosBody, child.accessToken).expect(201);
    expect(res.body.status).toBe('active');
    const evt = await raised;
    expect(evt).toMatchObject({ id: res.body.id, childName: 'Олена', childPhone: '+380671234567', battery: 12 });
    expect(evt.location).toMatchObject({ lat: FAR.lat, lng: FAR.lng });
    expect(Array.isArray(evt.route)).toBe(true);

    // Retried request (lost response) does not create a second alert.
    const retry = await client(h).post('/v1/sos', sosBody, child.accessToken).expect(201);
    expect(retry.body.id).toBe(res.body.id);

    const push = await waitFor(() => h.push.sentMessages.find((m) => m.data.type === 'sos'));
    expect(push.priority).toBe('critical');
    expect(push.channel).toBe('sos');
    expect(push.notification?.body).toContain('батарея 12%');

    const active = await parentHttp().get(`/v1/families/${familyId}/sos`, parent.accessToken).expect(200);
    expect(active.body.alerts).toHaveLength(1);

    const childSees = nextEvent(childSocket, 'sos.updated');
    const ack = await parentHttp().post(`/v1/sos/${res.body.id}/ack`, {}, parent.accessToken).expect(200);
    expect(ack.body).toMatchObject({ status: 'acknowledged', acknowledgedByName: 'Мама' });
    expect((await childSees).acknowledgedByName).toBe('Мама');

    await parentHttp().post(`/v1/sos/${res.body.id}/ack`, {}, parent.accessToken).expect(409);
    await parentHttp().post(`/v1/sos/${res.body.id}/resolve`, {}, parent.accessToken).expect(200);
  });

  it('lets a parent ask the child for a fresh fix', async () => {
    const childSocket = sockets[1];
    const request = nextEvent(childSocket, 'location.request');
    await parentHttp().post(`/v1/children/${childId}/locate`, {}, parent.accessToken).expect(202);
    expect((await request).reason).toBe('parent');
  });

  it('rotates refresh tokens and kills the chain on reuse', async () => {
    const r1 = await parentHttp().post('/v1/auth/refresh', { refreshToken: parent.refreshToken }).expect(200);
    const r2 = await parentHttp().post('/v1/auth/refresh', { refreshToken: r1.body.refreshToken }).expect(200);

    const reuse = await parentHttp().post('/v1/auth/refresh', { refreshToken: parent.refreshToken }).expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');
    // The legitimate latest token is revoked too: whoever holds the stolen copy is locked out.
    await parentHttp().post('/v1/auth/refresh', { refreshToken: r2.body.refreshToken }).expect(401);

    const login = await parentHttp()
      .post('/v1/auth/login', { email: 'MAMA@example.com', password: 'very-secret-pass', device: device() })
      .expect(200);
    parent = login.body;
    const bad = await parentHttp().post('/v1/auth/login', { email: 'mama@example.com', password: 'wrong-password', device: device() }).expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits invite code guessing', async () => {
    const attacker = client(h);
    const attempt = () =>
      attacker.post('/v1/invites/redeem', { code: 'ZZZZ-ZZZZ', device: device(), consent: { locationSharing: true, version: '2026-10' } });
    for (let i = 0; i < 5; i++) await attempt().expect(400);
    const blocked = await attempt().expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('blocks pausing for a child under 14 but lets the child leave at any age', async () => {
    const pause = await client(h).post('/v1/child/sharing/pause', { minutes: 60 }, child.accessToken).expect(403);
    expect(pause.body.error.code).toBe('PAUSE_NOT_ALLOWED');

    const left = nextEvent(sockets[0], 'child.left');
    await client(h).post('/v1/child/leave', {}, child.accessToken).expect(204);
    expect((await left).childId).toBe(childId);
    const after = await client(h).get('/v1/child/me', child.accessToken).expect(401);
    expect(after.body.error.code).toBe('DEVICE_REVOKED');

    const { count } = await h.db
      .selectFrom('locations')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('child_id', '=', childId)
      .executeTakeFirstOrThrow();
    expect(Number(count)).toBe(0);
    await waitFor(() => h.push.sentMessages.find((m) => m.data.type === 'child_left'));
  });

  it('exports data and then erases the account with everything in the family', async () => {
    const exported = await parentHttp().get('/v1/me/export', parent.accessToken).expect(200);
    expect(exported.body.families[0].children[0].displayName).toBe('Олена');

    await parentHttp().delete('/v1/me', parent.accessToken).expect(204);
    await parentHttp().get('/v1/me', parent.accessToken).expect(401);
    const users = await h.db.selectFrom('users').select('id').where('id', 'in', [parent.user.id, childId]).execute();
    expect(users).toHaveLength(0);
    const families = await h.db.selectFrom('families').select('id').where('id', '=', familyId).execute();
    expect(families).toHaveLength(0);
  });
});
