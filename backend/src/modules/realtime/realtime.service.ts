import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { rooms, ServerEvents } from './rooms';

/**
 * Thin facade over the Socket.IO server. With the Redis adapter every emit reaches
 * sockets connected to any API instance, so services never care where a client is.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  toFamilyParents(familyId: string, event: string, payload: unknown): void {
    this.emit(rooms.familyParents(familyId), event, payload);
  }

  toChild(childId: string, event: string, payload: unknown): void {
    this.emit(rooms.child(childId), event, payload);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.emit(rooms.user(userId), event, payload);
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    if (!this.server) return;
    const room = rooms.device(deviceId);
    this.server.to(room).emit(ServerEvents.DeviceRevoked, {});
    this.server.in(room).disconnectSockets(true);
  }

  async disconnectUser(userId: string): Promise<void> {
    this.server?.in(rooms.user(userId)).disconnectSockets(true);
  }

  /** Re-evaluates family rooms for a parent who just joined a family. */
  async joinFamilyRoom(userId: string, familyId: string): Promise<void> {
    this.server?.in(rooms.user(userId)).socketsJoin(rooms.familyParents(familyId));
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`Realtime not attached; dropped ${event} for ${room}`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
