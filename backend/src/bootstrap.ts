import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { APP_CONFIG, type AppConfig } from './config/env';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

/** Shared by main.ts and the e2e tests so both run the exact same HTTP stack. */
export async function configureApp(app: NestExpressApplication): Promise<INestApplication> {
  const cfg = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.useBodyParser('json', { limit: '256kb' });
  const origins = cfg.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : false });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: true,
    }),
  );
  const adapter = new RedisIoAdapter(app, cfg.REDIS_URL);
  await adapter.connect();
  app.useWebSocketAdapter(adapter);
  app.enableShutdownHooks();
  return app;
}
