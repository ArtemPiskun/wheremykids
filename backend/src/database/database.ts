import { Kysely, Migrator, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { AppConfig } from '../config/env';
import { migrationProvider } from './migrations';
import type { Database } from './types';

export const DB = Symbol('DB');
export type DB = Kysely<Database>;

export function createDatabase(cfg: Pick<AppConfig, 'DATABASE_URL' | 'DATABASE_POOL_MAX' | 'DATABASE_SSL'>): Kysely<Database> {
  const pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    max: cfg.DATABASE_POOL_MAX,
    ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<string[]> {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === 'Error');
  if (error || failed) {
    throw new Error(`Migration failed: ${failed?.migrationName ?? ''} ${String(error ?? '')}`.trim());
  }
  return (results ?? []).map((r) => r.migrationName);
}
