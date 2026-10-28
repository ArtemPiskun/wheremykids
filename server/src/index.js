import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
import { startPoller } from './alerts/poller.js';
import { alertsInUaSource } from './alerts/source.js';
import { loadGeojsonResolver, nominatimResolver, nullResolver } from './geo/oblastResolver.js';
import { fcmNotifier, logNotifier } from './notify/push.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);

let oblastResolver = nullResolver;
if (config.oblastGeojsonPath) oblastResolver = await loadGeojsonResolver(config.oblastGeojsonPath);
else if (config.useNominatim) oblastResolver = nominatimResolver();

const consoleLog = { info: (obj, text) => console.log(text, JSON.stringify(obj)) };
const notifier = config.firebaseCredentialsPath ? await fcmNotifier(config.firebaseCredentialsPath) : logNotifier(consoleLog);

const app = buildApp({ pool, notifier, oblastResolver }, { logger: true });

if (oblastResolver === nullResolver) app.log.warn('Джерело меж областей не задано (OBLAST_GEOJSON_PATH або USE_NOMINATIM=1): тривоги по дітях не надсилатимуться');

let stopPoller = () => {};
if (config.alertsToken) {
  stopPoller = startPoller({
    pool, notifier, source: alertsInUaSource({ token: config.alertsToken }), intervalMs: config.alertsPollMs, log: app.log,
  });
} else {
  app.log.warn('ALERTS_IN_UA_TOKEN не задано: тривоги не опитуються');
}

// Раз на годину видаляємо старі точки, щоб не зберігати зайвого про дітей
const cleanup = setInterval(() => {
  pool.query(`DELETE FROM locations WHERE recorded_at < now() - make_interval(days => $1)`, [config.locationRetentionDays])
    .catch((err) => app.log.warn({ err: err.message }, 'не вдалося почистити історію'));
}, 3600e3);

const shutdown = async () => {
  stopPoller();
  clearInterval(cleanup);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
