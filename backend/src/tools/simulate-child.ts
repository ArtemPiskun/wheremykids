/**
 * Child-device simulator for testing the parent app without a phone.
 *
 *   npm run build && npm run simulate:child -- --api http://localhost:3000 --code K7M2-QX9D
 *
 * Redeems the invite, then walks a loop around Kyiv's Golden Gate, uploading a batch every
 * --interval seconds. Pass --sos-after N to raise an SOS after N batches.
 */
import { randomUUID } from 'node:crypto';

interface Args {
  api: string;
  code: string;
  interval: number;
  sosAfter: number | null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const code = get('code');
  if (!code) throw new Error('Usage: simulate-child --code XXXX-XXXX [--api URL] [--interval 10] [--sos-after N]');
  return {
    api: get('api') ?? 'http://localhost:3000',
    code,
    interval: Number(get('interval') ?? 10),
    sosAfter: get('sos-after') ? Number(get('sos-after')) : null,
  };
}

const ROUTE = [
  [50.4485, 30.5131],
  [50.4501, 30.5162],
  [50.4517, 30.5197],
  [50.4532, 30.5235],
  [50.4513, 30.5262],
  [50.4492, 30.5231],
  [50.4479, 30.5188],
] as const;

async function call<T>(api: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`);
  return json;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const session = await call<{ accessToken: string; refreshToken: string; user: { displayName: string } }>(args.api, '/v1/invites/redeem', {
    code: args.code,
    device: { platform: 'android', model: 'Simulator', appVersion: 'sim' },
    consent: { locationSharing: true, version: '2026-10' },
  });
  console.log(`Connected as ${session.user.displayName}. Walking every ${args.interval}s; Ctrl+C to stop.`);

  let token = session.accessToken;
  let refresh = session.refreshToken;
  let battery = 87;
  for (let step = 0; ; step++) {
    const [lat, lng] = ROUTE[step % ROUTE.length];
    const jitter = () => (Math.random() - 0.5) * 0.0002;
    const point = { clientId: randomUUID(), lat: lat + jitter(), lng: lng + jitter(), accuracy: 8 + Math.random() * 20, speed: 1.3, recordedAt: new Date().toISOString(), source: 'gps', motion: 'walking' };
    try {
      const res = await call<{ accepted: number }>(args.api, '/v1/locations/batch', { points: [point], battery: { level: battery, charging: false } }, token);
      console.log(`#${step} ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} accepted=${res.accepted} battery=${battery}%`);
      if (args.sosAfter !== null && step + 1 === args.sosAfter) {
        const sos = await call<{ id: string }>(args.api, '/v1/sos', { clientId: randomUUID(), lat: point.lat, lng: point.lng, accuracy: point.accuracy, battery: { level: battery } }, token);
        console.log(`SOS raised: ${sos.id}`);
      }
    } catch (err) {
      if (String(err).includes('401')) {
        const pair = await call<{ accessToken: string; refreshToken: string }>(args.api, '/v1/auth/refresh', { refreshToken: refresh });
        token = pair.accessToken;
        refresh = pair.refreshToken;
        continue;
      }
      console.error(String(err));
    }
    battery = Math.max(5, battery - 1);
    await new Promise((r) => setTimeout(r, args.interval * 1000));
  }
}

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
