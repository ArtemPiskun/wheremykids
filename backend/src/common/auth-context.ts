import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../database/types';

export interface AuthUser {
  userId: string;
  role: UserRole;
  deviceId: string;
}

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  did: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';

/** Marks a route as reachable without an access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the given roles; combine with resource-level checks in services. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new Error('CurrentUser used on a public route');
  return user;
});

export function revokedDeviceKey(deviceId: string): string {
  return `revoked:dev:${deviceId}`;
}
