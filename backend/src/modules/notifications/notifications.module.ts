import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { FcmPushDriver, LogPushDriver, PUSH_DRIVER } from './push-driver';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [
    {
      provide: PUSH_DRIVER,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) =>
        cfg.PUSH_DRIVER === 'fcm' ? new FcmPushDriver(cfg.FCM_SERVICE_ACCOUNT_B64!) : new LogPushDriver(),
    },
    NotificationsService,
  ],
  exports: [NotificationsService, PUSH_DRIVER],
})
export class NotificationsModule {}
