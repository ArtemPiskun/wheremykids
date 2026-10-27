/**
 * The MVP's critical path, end to end, against a running API:
 *
 *   npm run build && npm run scenario -- [--api http://localhost:3000]
 *
 * A parent registers, creates a family, adds a child and a «Дім» zone, and listens on the
 * realtime socket like the parent app. A simulated child redeems the one-time invite with
 * explicit consent and walks into and out of the zone. Midway the child's network is cut
 * for real (a local TCP proxy between the simulator and the API is closed), fixes and an
 * SOS pile up on the device, and are delivered once the network comes back.
 *
 * Every step is checked; the process exits with code 1 on the first failure. Test data only.
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { ApiError, ChildSimulator } from './child-simulator';

const API = argValue('--api') ?? process.env.API ?? 'http://localhost:3000';
const ZONE = { lat: 50.4501, lng: 30.5162, radiusM: 150 };
const OUTSIDE = { lat: 50.4485, lng: 30.5131 }; // ~290 m from the zone centre
const INSIDE = { lat: 50.4502, lng: 30.5163 };
const FAR = { lat: 50.4532, lng: 30.5235 }; // ~620 m away
const EVENT_TIMEOUT_MS = 8000;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let stepNo = 0;
async function step<T>(title: string, fn: () => Promise<T>): Promise<T> {
  stepNo++;
  try {
    const result = await fn();
    console.log(`✓ ${stepNo}. ${title}`);
    return result;
  } catch (err) {
    console.log(`✗ ${stepNo}. ${title}\n    ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? '', json.error?.message ?? '');
  return json;
}

/**
 * Invite redemption is limited to 5 per minute per IP. Running the scenario twice in a row
 * trips that limit, which is the server doing its job: wait out the window once and go on.
 */
async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 429) throw err;
    console.log('    (invite rate limit hit by an earlier run, waiting 60 s)');
    await new Promise((r) => setTimeout(r, 61_000));
    return fn();
  }
}

/** Collects every realtime event the parent receives, so steps can wait for a matching one. */
class ParentInbox {
  private readonly events: Array<{ name: string; data: any }> = [];
  private waiters: Array<() => void> = [];

  constructor(readonly socket: Socket) {
    socket.onAny((name: string, data: unknown) => {
      this.events.push({ name, data });
      this.waiters.forEach((w) => w());
    });
  }

  async next(name: string, match: (data: any) => boolean = () => true): Promise<any> {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    for (;;) {
      const i = this.events.findIndex((e) => e.name === name && match(e.data));
      if (i >= 0) return this.events.splice(i, 1)[0].data;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`parent did not receive "${name}" within ${EVENT_TIMEOUT_MS} ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.waiters = [];
    }
  }
}

/** A TCP proxy in front of the API that can be switched off, i.e. a real network outage for the child. */
class Uplink {
  private server?: net.Server;
  private readonly sockets = new Set<net.Socket>();
  port = 0;

  constructor(private readonly target: URL) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async up(): Promise<void> {
    this.server = net.createServer((inbound) => {
      const outbound = net.connect(Number(this.target.port || 80), this.target.hostname);
      for (const s of [inbound, outbound]) {
        this.sockets.add(s);
        s.on('close', () => this.sockets.delete(s));
        s.on('error', () => s.destroy());
      }
      inbound.pipe(outbound).pipe(inbound);
    });
    await new Promise<void>((resolve) => this.server!.listen(this.port, '127.0.0.1', resolve));
    this.port = (this.server.address() as net.AddressInfo).port;
  }

  async down(): Promise<void> {
    this.sockets.forEach((s) => s.destroy());
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = undefined;
  }
}

async function main(): Promise<void> {
  console.log(`Scenario against ${API}\n`);
  const tag = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const device = { platform: 'android', model: 'scenario-parent', pushToken: `scenario-parent-${tag}` };

  const parent = await step('Parent registers a family account', async () => {
    const reg = await call<{ accessToken: string; user: { id: string } }>('POST', '/v1/auth/register', {
      email: `parent+${tag}@example.com`,
      password: `Scenario-${tag}`,
      displayName: 'Олена (тест)',
      acceptPrivacyPolicy: true,
      device,
    });
    const family = await call<{ id: string }>('POST', '/v1/families', { name: 'Тестова родина' }, reg.accessToken);
    return { token: reg.accessToken, familyId: family.id };
  });

  const { childId, zoneId } = await step('Parent adds a child and a «Дім» safe zone', async () => {
    const child = await call<{ id: string }>('POST', `/v1/families/${parent.familyId}/children`, { displayName: 'Марко (тест)', birthYear: 2014 }, parent.token);
    const zone = await call<{ id: string }>(
      'POST',
      `/v1/families/${parent.familyId}/geofences`,
      { name: 'Дім', kind: 'home', ...ZONE, notifyEnter: true, notifyExit: true },
      parent.token,
    );
    return { childId: child.id, zoneId: zone.id };
  });

  const code = await step('Parent creates a one-time invite', async () => {
    const invite = await call<{ code: string; expiresAt: string }>('POST', `/v1/families/${parent.familyId}/children/${childId}/invites`, {}, parent.token);
    check(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(invite.code), `unexpected code format ${invite.code}`);
    return invite.code;
  });

  const inbox = await step('Parent app connects to the realtime channel', async () => {
    const socket = io(`${API}/rt`, { transports: ['websocket'], auth: { token: parent.token }, reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await new Promise((r) => setTimeout(r, 200)); // rooms are joined right after the handshake
    return new ParentInbox(socket);
  });

  const uplink = new Uplink(new URL(API));
  await uplink.up();
  const sim = new ChildSimulator(uplink.url);

  await step('Child cannot connect without explicitly agreeing to share location', async () => {
    try {
      await patiently(() => sim.redeem(code, false));
    } catch (err) {
      check(err instanceof ApiError && err.status === 400, `expected 400, got ${String(err)}`);
      return;
    }
    throw new Error('redeem without consent was accepted');
  });

  await step('Child redeems the invite with consent; parent is told the child joined', async () => {
    const session = await patiently(() => sim.redeem(code, true));
    check(session.user.id === childId, 'invite connected a different child');
    await inbox.next('child.joined', (d) => d.childId === childId);
  });

  await step('The same invite cannot be used a second time', async () => {
    try {
      await patiently(() => new ChildSimulator(API).redeem(code, true));
    } catch (err) {
      check(err instanceof ApiError && err.code === 'INVITE_INVALID', `expected INVITE_INVALID, got ${String(err)}`);
      return;
    }
    throw new Error('invite was accepted twice');
  });

  await step("Child's coordinates reach the parent in real time and via the API", async () => {
    const p = sim.record(OUTSIDE.lat, OUTSIDE.lng);
    const res = await sim.flush();
    check(res.ok && res.sent === 1, `upload failed: ${res.error}`);
    const ev = await inbox.next('location.updated', (d) => d.childId === childId);
    check(Math.abs(ev.lat - p.lat) < 1e-9 && Math.abs(ev.lng - p.lng) < 1e-9, 'realtime point differs from the one sent');
    const latest = await call<{ children: Array<{ childId: string; status: string; location: { lat: number } | null }> }>(
      'GET',
      `/v1/families/${parent.familyId}/locations/latest`,
      undefined,
      parent.token,
    );
    const me = latest.children.find((c) => c.childId === childId);
    check(me?.location && Math.abs(me.location.lat - p.lat) < 1e-9, 'latest location is missing');
    check(me.status === 'online', `child status is ${me.status}`);
  });

  await step('Entering the zone creates an «enter» event for the parent', async () => {
    sim.record(INSIDE.lat, INSIDE.lng);
    check((await sim.flush()).ok, 'upload failed');
    const ev = await inbox.next('geofence.transition', (d) => d.childId === childId && d.kind === 'enter');
    check(ev.geofenceId === zoneId, 'event for the wrong zone');
  });

  await step('Leaving the zone creates an «exit» event for the parent', async () => {
    sim.record(FAR.lat, FAR.lng);
    check((await sim.flush()).ok, 'upload failed');
    await inbox.next('geofence.transition', (d) => d.childId === childId && d.kind === 'exit');
    const log = await call<{ events: Array<{ kind: string; geofenceId: string }> }>('GET', `/v1/families/${parent.familyId}/geofence-events`, undefined, parent.token);
    const kinds = log.events.filter((e) => e.geofenceId === zoneId).map((e) => e.kind);
    check(kinds.includes('enter') && kinds.includes('exit'), `event log has ${JSON.stringify(kinds)}`);
  });

  const offline = await step('Network drops: fixes and an SOS stay queued on the child device', async () => {
    await uplink.down();
    const points = [sim.record(50.4535, 30.524), sim.record(50.4538, 30.5245), sim.record(50.454, 30.525)];
    const sos = await sim.raiseSos(50.454, 30.525);
    check(sos === null, 'SOS went through although the network is down');
    const res = await sim.flush();
    check(!res.ok && res.pending === 3, `expected 3 queued points, got ${JSON.stringify(res)}`);
    return points;
  });

  const sosId = await step('Network returns: queued fixes and the SOS are delivered, nothing lost', async () => {
    await uplink.up();
    const res = await sim.flush();
    check(res.ok && res.sent === 3 && res.pending === 0, `flush after recovery: ${JSON.stringify(res)}`);
    const last = offline.at(-1)!;
    await inbox.next('location.updated', (d) => d.childId === childId && Math.abs(d.lat - last.lat) < 1e-9);
    const from = new Date(Date.parse(offline[0].recordedAt) - 1000).toISOString();
    const history = await call<{ points: Array<{ recordedAt: string }> }>(
      'GET',
      `/v1/children/${childId}/history?from=${from}&to=${new Date().toISOString()}&simplify=false`,
      undefined,
      parent.token,
    );
    const stored = new Set(history.points.map((p) => p.recordedAt));
    check(offline.every((p) => stored.has(p.recordedAt)), 'some offline fixes are missing from history');
    const sos = await inbox.next('sos.raised', (d) => d.childId === childId);
    return sos.id as string;
  });

  await step('Parent acknowledges the SOS, sends the responder name, then resolves it', async () => {
    const ack = await call<{ status: string; acknowledgedByName?: string }>('POST', `/v1/sos/${sosId}/ack`, {}, parent.token);
    check(ack.status === 'acknowledged', `SOS status is ${ack.status}`);
    // The same view goes to the child's devices, so the child sees who is coming.
    const ev = await inbox.next('sos.updated', (d) => d.id === sosId && d.status === 'acknowledged');
    check(ev.acknowledgedByName === 'Олена (тест)', `acknowledgedByName is ${ev.acknowledgedByName}`);
    await call('POST', `/v1/sos/${sosId}/resolve`, {}, parent.token);
  });

  inbox.socket.disconnect();
  await uplink.down();
  console.log(`\nAll ${stepNo} steps passed. With PUSH_DRIVER=log the API log shows the parent's pushes (zone enter/exit, critical SOS).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
