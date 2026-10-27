import { randomBytes } from 'node:crypto';
import { loadConfig } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  INVITE_PEPPER: 'y'.repeat(40),
  AUDIT_IP_SALT: 'z'.repeat(20),
  LOCATION_ENC_KEYS: `1:${randomBytes(32).toString('base64')}`,
  LOCATION_ENC_ACTIVE_KEY: '1',
};

describe('loadConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const cfg = loadConfig(valid);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.LOCATION_ENC_KEYS.get(1)).toHaveLength(32);
  });

  it('refuses weak or missing secrets', () => {
    expect(() => loadConfig({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig({ ...valid, LOCATION_ENC_KEYS: '1:c2hvcnQ=' })).toThrow(/32 bytes/);
    expect(() => loadConfig({ ...valid, LOCATION_ENC_ACTIVE_KEY: '2' })).toThrow(/ACTIVE_KEY/);
    expect(() => loadConfig({ ...valid, PUSH_DRIVER: 'fcm' })).toThrow(/FCM_SERVICE_ACCOUNT_B64/);
  });
});
