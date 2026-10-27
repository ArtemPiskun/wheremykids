import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './config/env';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  await configureApp(app);
  const cfg = app.get<AppConfig>(APP_CONFIG);
  await app.listen(cfg.PORT, '0.0.0.0');
  app.get(Logger).log(`API listening on :${cfg.PORT} (mode=${cfg.RUN_MODE}, push=${cfg.PUSH_DRIVER})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
