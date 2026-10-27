import { sql, type Kysely } from 'kysely';
import type { Database } from './types';

function monthStart(date: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

function partitionName(start: Date): string {
  return `locations_y${start.getUTCFullYear()}m${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Creates monthly partitions from the previous month up to `monthsAhead` months in the future. */
export async function ensureLocationPartitions(db: Kysely<Database>, now = new Date(), monthsAhead = 2): Promise<void> {
  for (let offset = -1; offset <= monthsAhead; offset++) {
    const from = monthStart(now, offset);
    const to = monthStart(now, offset + 1);
    const name = partitionName(from);
    const exists = await sql<{ exists: boolean }>`SELECT to_regclass(${name}) IS NOT NULL AS exists`.execute(db);
    if (exists.rows[0]?.exists) continue;
    try {
      await sql`CREATE TABLE ${sql.table(name)} PARTITION OF locations FOR VALUES FROM (${sql.lit(from.toISOString())}) TO (${sql.lit(to.toISOString())})`.execute(db);
    } catch (err) {
      // Another instance may have created it concurrently.
      if (!String(err).includes('already exists')) throw err;
    }
  }
}

/** Drops whole monthly partitions whose upper bound is older than `maxAgeDays`. Returns dropped names. */
export async function dropExpiredLocationPartitions(db: Kysely<Database>, maxAgeDays: number, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000);
  const { rows } = await sql<{ name: string }>`
    SELECT c.relname AS name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'locations' AND c.relname ~ '^locations_y[0-9]{4}m[0-9]{2}$'`.execute(db);

  const dropped: string[] = [];
  for (const { name } of rows) {
    const year = Number(name.slice(11, 15));
    const month = Number(name.slice(16, 18));
    const upperBound = new Date(Date.UTC(year, month, 1));
    if (upperBound <= cutoff) {
      await sql`DROP TABLE IF EXISTS ${sql.table(name)}`.execute(db);
      dropped.push(name);
    }
  }
  return dropped;
}
