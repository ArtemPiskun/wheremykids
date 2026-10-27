import type { Migration, MigrationProvider } from 'kysely';
import * as m0001 from './0001_init';

/** Migrations are registered explicitly so the compiled bundle never scans the file system. */
export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { '0001_init': m0001 };
  },
};
