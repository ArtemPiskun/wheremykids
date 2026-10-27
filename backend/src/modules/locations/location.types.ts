import type { LocationSource } from '../../database/types';

/** Plaintext of the encrypted `payload` column. Short keys keep ciphertext small. */
export interface EncryptedFix {
  lat: number;
  lng: number;
  acc: number;
  spd?: number;
  hdg?: number;
  alt?: number;
}

export interface LocationView {
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  recordedAt: string;
  source: LocationSource;
  motion?: string | null;
  battery?: number | null;
}

export type PresenceStatus = 'online' | 'recent' | 'offline' | 'paused';

export const ONLINE_WINDOW_MS = 5 * 60_000;
export const RECENT_WINDOW_MS = 60 * 60_000;

export function presenceStatus(lastSeenMs: number | null, now: number, pausedUntil?: Date | null): PresenceStatus {
  if (pausedUntil && pausedUntil.getTime() > now) return 'paused';
  if (lastSeenMs === null) return 'offline';
  const age = now - lastSeenMs;
  if (age <= ONLINE_WINDOW_MS) return 'online';
  if (age <= RECENT_WINDOW_MS) return 'recent';
  return 'offline';
}
