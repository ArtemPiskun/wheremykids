import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { createDatabase, DB } from './database';

@Global()
@Module({
  providers: [{ provide: DB, inject: [APP_CONFIG], useFactory: (cfg: AppConfig) => createDatabase(cfg) }],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: DB) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
