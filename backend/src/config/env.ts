import { z } from 'zod';

const boolish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RUN_MODE: z.enum(['all', 'api', 'worker']).default('all'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_SSL: boolish.default('false'),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_DAYS_PARENT: z.coerce.number().int().min(1).default(60),
  REFRESH_TTL_DAYS_CHILD: z.coerce.number().int().min(1).default(180),

  /** HMAC pepper for invite codes and other short secrets. */
  INVITE_PEPPER: z.string().min(32),
  /** Salt used to pseudonymise IP addresses in the audit log. */
  AUDIT_IP_SALT: z.string().min(16),

  /** Comma-separated `version:base64key` list; keeps old keys readable after rotation. */
  LOCATION_ENC_KEYS: z
    .string()
    .transform((raw, ctx) => {
      const keys = new Map<number, Buffer>();
      for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
        const [ver, key] = part.split(':');
        const version = Number(ver);
        if (!Number.isInteger(version) || version < 1 || version > 32767 || !key) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid key entry "${ver}"` });
          return z.NEVER;
        }
        const parsed = base64Key.safeParse(key);
        if (!parsed.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `key ${version} must be 32 bytes base64` });
          return z.NEVER;
        }
        keys.set(version, Buffer.from(key, 'base64'));
      }
      if (keys.size === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'at least one key is required' });
        return z.NEVER;
      }
      return keys;
    }),
  LOCATION_ENC_ACTIVE_KEY: z.coerce.number().int().min(1),

  PUSH_DRIVER: z.enum(['log', 'fcm']).default('log'),
  /** Firebase service-account JSON, base64-encoded. Required when PUSH_DRIVER=fcm. */
  FCM_SERVICE_ACCOUNT_B64: z.string().optional(),

  CORS_ORIGINS: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const cfg = result.data;
  if (!cfg.LOCATION_ENC_KEYS.has(cfg.LOCATION_ENC_ACTIVE_KEY)) {
    throw new Error('LOCATION_ENC_ACTIVE_KEY must reference a key in LOCATION_ENC_KEYS');
  }
  if (cfg.PUSH_DRIVER === 'fcm' && !cfg.FCM_SERVICE_ACCOUNT_B64) {
    throw new Error('FCM_SERVICE_ACCOUNT_B64 is required when PUSH_DRIVER=fcm');
  }
  return cfg;
}
