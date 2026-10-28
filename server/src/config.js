// Усі налаштування беруться зі змінних середовища (див. .env.example)
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'postgres://moi:moi@localhost:5432/moi',
    alertsToken: env.ALERTS_IN_UA_TOKEN ?? '',
    // live — alerts.in.ua (потрібен токен), mock — заглушка, тривоги вмикаються вручну на /dev/alerts
    alertsMode: env.ALERTS_MODE ?? (env.ALERTS_IN_UA_TOKEN ? 'live' : 'mock'),
    alertsPollMs: Number(env.ALERTS_POLL_MS ?? 15000),
    // Пароль до сторінки керування заглушкою тривог
    devToken: env.DEV_TOKEN ?? '',
    oblastGeojsonPath: env.OBLAST_GEOJSON_PATH ?? '',
    // Без файлу меж область визначає Nominatim; USE_NOMINATIM=0 вимикає це
    useNominatim: env.USE_NOMINATIM !== '0',
    firebaseCredentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    // Альтернатива файлу для хостингів без файлової системи: увесь JSON ключа в base64
    firebaseCredentialsBase64: env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? 'my-kids-1f72d',
    locationRetentionDays: Number(env.LOCATION_RETENTION_DAYS ?? 30),
  };
}
