import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { revokedDeviceKey, type AccessTokenClaims } from '../../common/auth-context';
import { REDIS } from '../../redis/redis.module';
import { FamilyAccessService } from '../families/family-access.service';
import { LocationStateStore } from '../locations/location-state.store';
import { presenceStatus } from '../locations/location.types';
import { RealtimeService } from './realtime.service';
import { ClientEvents, rooms, ServerEvents } from './rooms';

interface SocketData {
  claims: AccessTokenClaims;
  familyId?: string;
}

type AppSocket = Socket & { data: Partial<SocketData> };

@WebSocketGateway({ namespace: '/rt', transports: ['websocket'], cors: { origin: false } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly access: FamilyAccessService,
    private readonly state: LocationStateStore,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(socket: AppSocket): Promise<void> {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
      if (!token) throw new Error('missing token');
      const claims = await this.jwt.verifyAsync<AccessTokenClaims & { exp: number }>(token);
      if (await this.redis.exists(revokedDeviceKey(claims.did))) throw new Error('device revoked');
      socket.data.claims = claims;

      // Membership comes from the database; clients cannot choose rooms.
      const joins = [rooms.user(claims.sub), rooms.device(claims.did)];
      if (claims.role === 'parent') {
        for (const familyId of await this.access.parentFamilyIds(claims.sub)) joins.push(rooms.familyParents(familyId));
      } else {
        joins.push(rooms.child(claims.sub));
        const family = await this.access.familyOfChild(claims.sub);
        if (!family) throw new Error('child without family');
        socket.data.familyId = family.familyId;
        await this.markChildSeen(claims.sub, family.familyId);
      }
      await socket.join(joins);

      // Close the socket when the access token expires; the client refreshes and reconnects.
      const msLeft = claims.exp * 1000 - Date.now();
      const timer = setTimeout(() => {
        socket.emit(ServerEvents.AuthExpired);
        socket.disconnect(true);
      }, Math.max(0, msLeft));
      timer.unref();
      socket.once('disconnect', () => clearTimeout(timer));
    } catch (err) {
      this.logger.debug(`Rejected socket ${socket.id}: ${String(err)}`);
      socket.emit(ServerEvents.AuthExpired);
      socket.disconnect(true);
    }
  }

  @SubscribeMessage(ClientEvents.PresencePing)
  async onPresencePing(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<{ ok: true }> {
    const { claims, familyId } = socket.data;
    if (claims?.role !== 'child' || !familyId) return { ok: true };
    const battery = parseBattery(body);
    await this.markChildSeen(claims.sub, familyId, battery);
    if (battery) {
      this.realtime.toFamilyParents(familyId, ServerEvents.ChildPresence, {
        childId: claims.sub,
        status: 'online',
        lastSeenAt: new Date().toISOString(),
        battery: battery.level,
        charging: battery.charging ?? null,
      });
    }
    return { ok: true };
  }

  private async markChildSeen(childId: string, familyId: string, battery?: { level: number; charging?: boolean }): Promise<void> {
    const prev = await this.state.touchPresence(childId, battery);
    if (presenceStatus(prev, Date.now()) !== 'online') {
      this.realtime.toFamilyParents(familyId, ServerEvents.ChildPresence, {
        childId,
        status: 'online',
        lastSeenAt: new Date().toISOString(),
        battery: battery?.level ?? null,
      });
    }
  }
}

function parseBattery(body: unknown): { level: number; charging?: boolean } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { battery, charging } = body as { battery?: unknown; charging?: unknown };
  if (typeof battery !== 'number' || !Number.isInteger(battery) || battery < 0 || battery > 100) return undefined;
  return { level: battery, charging: typeof charging === 'boolean' ? charging : undefined };
}
