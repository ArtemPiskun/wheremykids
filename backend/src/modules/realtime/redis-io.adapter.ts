import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Socket.IO adapter that fans out emits across all API instances through Redis pub/sub. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.redisUrl);
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, { ...options, pingInterval: 25_000, pingTimeout: 20_000, maxHttpBufferSize: 64 * 1024 });
    if (this.adapterConstructor) (server as { adapter: (a: unknown) => void }).adapter(this.adapterConstructor);
    return server;
  }

  override async dispose(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => c.disconnect())));
  }
}
