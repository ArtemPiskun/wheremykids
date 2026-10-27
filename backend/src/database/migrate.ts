import { loadConfig } from '../config/env';
import { createDatabase, migrateToLatest } from './database';
import { ensureLocationPartitions } from './partitions';

async function main(): Promise<void> {
  const db = createDatabase(loadConfig());
  try {
    const applied = await migrateToLatest(db);
    await ensureLocationPartitions(db);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
