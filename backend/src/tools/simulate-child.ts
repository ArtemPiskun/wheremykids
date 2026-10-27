/**
 * Child-device simulator for testing the parent app without a phone.
 *
 *   npm run build && npm run simulate:child -- --api http://localhost:3000 --code K7M2-QX9D
 *
 * Redeems the invite (with the child's consent), then walks a loop around Kyiv's Golden Gate,
 * recording a fix every --interval seconds. Fixes are queued locally and uploaded like the app
 * does, so a dropped connection loses nothing.
 *
 *   --sos-after N        raise an SOS after N fixes
 *   --offline-after N    pretend the phone lost the network after N fixes...
 *   --offline-for M      ...for M fixes; they are queued and sent together when it comes back
 */
import { ChildSimulator } from './child-simulator';

interface Args {
  api: string;
  code: string;
  interval: number;
  sosAfter: number | null;
  offlineAfter: number | null;
  offlineFor: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const code = get('code');
  if (!code) {
    throw new Error('Usage: simulate-child --code XXXX-XXXX [--api URL] [--interval 10] [--sos-after N] [--offline-after N --offline-for M]');
  }
  return {
    api: get('api') ?? 'http://localhost:3000',
    code,
    interval: Number(get('interval') ?? 10),
    sosAfter: get('sos-after') ? Number(get('sos-after')) : null,
    offlineAfter: get('offline-after') ? Number(get('offline-after')) : null,
    offlineFor: Number(get('offline-for') ?? 3),
  };
}

/** Starts ~280 m from the Golden Gate, walks through the «Дім» zone from smoke.sh and out again. */
export const ROUTE = [
  [50.4485, 30.5131],
  [50.4501, 30.5162],
  [50.4517, 30.5197],
  [50.4532, 30.5235],
  [50.4513, 30.5262],
  [50.4492, 30.5231],
  [50.4479, 30.5188],
] as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sim = new ChildSimulator(args.api);
  const session = await sim.redeem(args.code);
  console.log(`Connected as ${session.user.displayName}. A fix every ${args.interval}s; Ctrl+C to stop.`);

  for (let step = 0; ; step++) {
    const [lat, lng] = ROUTE[step % ROUTE.length];
    const jitter = () => (Math.random() - 0.5) * 0.0002;
    const point = sim.record(lat + jitter(), lng + jitter(), 8 + Math.random() * 12);
    const offline = args.offlineAfter !== null && step >= args.offlineAfter && step < args.offlineAfter + args.offlineFor;

    if (offline) {
      console.log(`#${step} ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} offline, queued=${sim.queue.length}`);
    } else {
      const res = await sim.flush();
      console.log(
        `#${step} ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} ` +
          (res.ok ? `sent=${res.sent}` : `upload failed (${res.error}), queued=${res.pending}`) +
          ` battery=${sim.battery}%`,
      );
    }
    if (args.sosAfter !== null && step + 1 === args.sosAfter) {
      if (offline) sim.queueSos(point.lat, point.lng, point.accuracy);
      const sos = offline ? null : await sim.raiseSos(point.lat, point.lng, point.accuracy);
      console.log(sos ? `SOS raised: ${sos.id}` : 'SOS queued: will be sent as soon as the network is back');
    }
    sim.battery = Math.max(5, sim.battery - 1);
    await new Promise((r) => setTimeout(r, args.interval * 1000));
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(String(err));
    process.exit(1);
  });
}
