import { randomUUID } from 'node:crypto';

/**
 * A virtual child device for testing without a phone. It behaves like the mobile app's
 * tracking loop where it matters for the server: every fix gets a clientId, goes into a
 * local queue first and is only dropped after the server accepted it. While the network
 * is down the queue grows; the next successful upload sends everything in order.
 */

/** Same limit as the API (MAX_BATCH in locations.dto.ts). */
const MAX_BATCH = 100;

export interface SimPoint {
  clientId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number;
  recordedAt: string;
  source: 'gps' | 'network' | 'fused' | 'manual' | 'sos';
  motion?: 'stationary' | 'walking' | 'vehicle';
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  familyId: string;
  user: { id: string; displayName: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${status} ${code} ${message}`.trim());
  }
}

/** Thrown when the request never got an HTTP answer (offline, DNS, refused, timeout). */
export class NetworkError extends Error {}

export interface FlushResult {
  sent: number;
  pending: number;
  /** false when the upload failed and points stayed queued. */
  ok: boolean;
  error?: string;
}

export class ChildSimulator {
  readonly queue: SimPoint[] = [];
  private session?: Session;
  private pendingSos?: { clientId: string; lat: number; lng: number; accuracy: number };
  battery = 87;

  constructor(readonly api: string) {}

  get childId(): string | undefined {
    return this.session?.user.id;
  }

  get familyId(): string | undefined {
    return this.session?.familyId;
  }

  /** Redeems a one-time invite. `consent` must be true: the server refuses tracking without it. */
  async redeem(code: string, consent = true): Promise<Session> {
    this.session = await this.request<Session>('POST', '/v1/invites/redeem', {
      code,
      device: { platform: 'android', model: 'Simulator', appVersion: 'sim' },
      consent: { locationSharing: consent, version: '2026-10' },
    });
    return this.session;
  }

  /** Records a fix into the local queue, like the app does before any upload. */
  record(lat: number, lng: number, accuracy = 10): SimPoint {
    const point: SimPoint = {
      clientId: randomUUID(),
      lat,
      lng,
      accuracy,
      speed: 1.3,
      recordedAt: new Date().toISOString(),
      source: 'gps',
      motion: 'walking',
    };
    this.queue.push(point);
    return point;
  }

  /** Uploads queued points in order. Network and 5xx/429 failures keep them for the next try. */
  async flush(): Promise<FlushResult> {
    let sent = 0;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, MAX_BATCH);
        try {
          await this.authed('POST', '/v1/locations/batch', { points: batch, battery: { level: this.battery, charging: false } });
        } catch (err) {
          // The server will never take this batch (validation): drop it so the queue keeps moving.
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
            this.queue.splice(0, batch.length);
            continue;
          }
          throw err;
        }
        this.queue.splice(0, batch.length);
        sent += batch.length;
      }
      if (this.pendingSos) await this.sendSos();
      return { sent, pending: this.queue.length, ok: true };
    } catch (err) {
      return { sent, pending: this.queue.length, ok: false, error: String(err instanceof Error ? err.message : err) };
    }
  }

  /** Raises an SOS. If it cannot be delivered now, it is retried on every flush with the same clientId. */
  async raiseSos(lat: number, lng: number, accuracy = 10): Promise<{ id: string } | null> {
    this.queueSos(lat, lng, accuracy);
    try {
      return await this.sendSos();
    } catch {
      return null;
    }
  }

  /** Keeps an SOS for the next flush, e.g. when it was pressed with no network. */
  queueSos(lat: number, lng: number, accuracy = 10): void {
    this.pendingSos ??= { clientId: randomUUID(), lat, lng, accuracy };
  }

  private async sendSos(): Promise<{ id: string }> {
    const sos = this.pendingSos!;
    const res = await this.authed<{ id: string }>('POST', '/v1/sos', { ...sos, battery: { level: this.battery } });
    this.pendingSos = undefined;
    return res;
  }

  private async authed<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.session) throw new Error('Not connected: redeem an invite first');
    try {
      return await this.request<T>(method, path, body, this.session.accessToken);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401 || err.code !== 'TOKEN_INVALID') throw err;
      const pair = await this.request<{ accessToken: string; refreshToken: string }>('POST', '/v1/auth/refresh', {
        refreshToken: this.session.refreshToken,
      });
      this.session = { ...this.session, ...pair };
      return this.request<T>(method, path, body, this.session.accessToken);
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.api}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new NetworkError(`network: ${String((err as Error).cause ?? err)}`);
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
    if (!res.ok) throw new ApiError(res.status, json.error?.code ?? '', json.error?.message ?? '');
    return json;
  }
}
