// Усі налаштування беруться зі змінних середовища (див. .env.example)
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'postgres://moi:moi@localhost:5432/moi',
    alertsToken: env.ALERTS_IN_UA_TOKEN ?? '',
    alertsPollMs: Number(env.ALERTS_POLL_MS ?? 15000),
    oblastGeojsonPath: env.OBLAST_GEOJSON_PATH ?? '',
    useNominatim: env.USE_NOMINATIM === '1',
    firebaseCredentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    // Альтернатива файлу для хостингів без файлової системи: увесь JSON ключа в base64
    firebaseCredentialsBase64: env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? 'my-kids-1f72d',
    locationRetentionDays: Number(env.LOCATION_RETENTION_DAYS ?? 30),
  };
}
