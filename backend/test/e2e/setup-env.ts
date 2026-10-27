import { randomBytes } from 'node:crypto';

const b64 = (n: number) => randomBytes(n).toString('base64');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.TRUST_PROXY = '1';
process.env.RUN_MODE = 'all';
process.env.DATABASE_URL ??= 'postgres://demoidity:demoidity@localhost:5432/demoidity_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET = b64(48);
process.env.INVITE_PEPPER = b64(32);
process.env.AUDIT_IP_SALT = b64(24);
process.env.LOCATION_ENC_KEYS = `1:${b64(32)}`;
process.env.LOCATION_ENC_ACTIVE_KEY = '1';
process.env.PUSH_DRIVER = 'log';
