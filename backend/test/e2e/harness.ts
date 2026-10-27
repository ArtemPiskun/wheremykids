import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import { sql } from 'kysely';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { DB, migrateToLatest } from '../../src/database/database';
import { ensureLocationPartitions } from '../../src/database/partitions';
import { LogPushDriver, PUSH_DRIVER } from '../../src/modules/notifications/push-driver';
import { REDIS } from '../../src/redis/redis.module';

export interface Harness {
  app: NestExpressApplication;
  url: string;
  push: LogPushDriver;
  db: DB;
  close(): Promise<void>;
}

let ipCounter = 1;
/** Each logical client gets its own IP so per-IP rate limits do not bleed between tests. */
export const freshIp = (): string => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn'] });
  const db = app.get<DB>(DB);
  await sql`DROP SCHEMA public CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  await migrateToLatest(db);
  await ensureLocationPartitions(db);
  await app.get<Redis>(REDIS).flushdb();

  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  return {
    app,
    url: await app.getUrl(),
    push: app.get<LogPushDriver>(PUSH_DRIVER),
    db,
    close: () => app.close(),
  };
}

/** A supertest client pinned to one simulated client IP. */
export function client(h: Harness, ip = freshIp()) {
  const agent = request(h.app.getHttpServer());
  const withIp = <T extends request.Test>(t: T, token?: string): T => {
    t.set('X-Forwarded-For', ip);
    if (token) t.set('Authorization', `Bearer ${token}`);
    return t;
  };
  return {
    get: (path: string, token?: string) => withIp(agent.get(path), token),
    post: (path: string, body: object = {}, token?: string) => withIp(agent.post(path), token).send(body),
    patch: (path: string, body: object, token?: string) => withIp(agent.patch(path), token).send(body),
    put: (path: string, body: object, token?: string) => withIp(agent.put(path), token).send(body),
    delete: (path: string, token?: string) => withIp(agent.delete(path), token),
  };
}

export function connectSocket(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${url}/rt`, { transports: ['websocket'], auth: { token }, reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.on('connect', () => {
      // Rooms are joined asynchronously after the handshake.
      setTimeout(() => {
        clearTimeout(timer);
        resolve(socket);
      }, 200);
    });
    socket.on('connect_error', reject);
  });
}

export function nextEvent<T = any>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export async function waitFor<T>(fn: () => T | undefined | null | false | Promise<T | undefined | null | false>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}
