import { Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';

export type PushPriority = 'critical' | 'high' | 'normal';

export interface PushMessage {
  token: string;
  platform: 'android' | 'ios';
  /** Absent for data-only (silent) messages. */
  notification?: { title: string; body: string };
  data: Record<string, string>;
  priority: PushPriority;
  /** Android notification channel; must exist in the app. */
  channel: 'sos' | 'zones' | 'info';
  collapseKey?: string;
}

export interface PushResult {
  invalidTokens: string[];
  sent: number;
}

export interface PushDriver {
  send(messages: PushMessage[]): Promise<PushResult>;
}

export const PUSH_DRIVER = Symbol('PUSH_DRIVER');

/** Development/test driver: records messages instead of sending them. */
export class LogPushDriver implements PushDriver {
  private readonly logger = new Logger('LogPushDriver');
  readonly sentMessages: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushResult> {
    for (const m of messages) {
      this.sentMessages.push(m);
      this.logger.log(`[${m.priority}] ${m.notification?.title ?? '(data)'} → …${m.token.slice(-6)} ${JSON.stringify(m.data)}`);
    }
    return { invalidTokens: [], sent: messages.length };
  }
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class FcmPushDriver implements PushDriver {
  private readonly logger = new Logger('FcmPushDriver');
  private app: App | null = null;

  constructor(private readonly serviceAccountB64: string) {}

  async send(messages: PushMessage[]): Promise<PushResult> {
    if (messages.length === 0) return { invalidTokens: [], sent: 0 };
    const { getMessaging } = await import('firebase-admin/messaging');
    const result = await getMessaging(await this.getApp()).sendEach(messages.map((m) => this.toFcm(m)));
    const invalidTokens: string[] = [];
    result.responses.forEach((r, i) => {
      if (r.success) return;
      if (r.error && INVALID_TOKEN_CODES.has(r.error.code)) invalidTokens.push(messages[i].token);
      else this.logger.warn(`FCM send failed: ${r.error?.code} ${r.error?.message}`);
    });
    return { invalidTokens, sent: result.successCount };
  }

  private async getApp(): Promise<App> {
    if (this.app) return this.app;
    const { cert, initializeApp } = await import('firebase-admin/app');
    const credentials = JSON.parse(Buffer.from(this.serviceAccountB64, 'base64').toString('utf8'));
    this.app = initializeApp({ credential: cert(credentials) }, 'de-moi-dity');
    return this.app;
  }

  private toFcm(m: PushMessage) {
    const iosLevel = m.priority === 'critical' ? 'critical' : m.priority === 'high' ? 'time-sensitive' : 'active';
    return {
      token: m.token,
      notification: m.notification,
      data: m.data,
      android: {
        priority: m.priority === 'normal' ? ('normal' as const) : ('high' as const),
        collapseKey: m.collapseKey,
        ttl: m.priority === 'normal' ? 3_600_000 : 600_000,
        notification: m.notification
          ? { channelId: m.channel, sound: 'default', defaultVibrateTimings: true }
          : undefined,
      },
      apns: {
        headers: {
          'apns-priority': m.notification || m.priority !== 'normal' ? '10' : '5',
          ...(m.collapseKey && { 'apns-collapse-id': m.collapseKey }),
        },
        payload: {
          aps: m.notification
            ? {
                'interruption-level': iosLevel,
                sound: m.priority === 'critical' ? { critical: true, name: 'default', volume: 1 } : 'default',
              }
            : { 'content-available': 1 },
        },
      },
    };
  }
}
