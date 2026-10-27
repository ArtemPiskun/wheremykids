import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './common/auth.guard';
import { ApiExceptionFilter } from './common/exception.filter';
import { CommonModule } from './common/common.module';
import { RateLimitGuard } from './common/rate-limit';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, type AppConfig } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AccessModule } from './modules/families/access.module';
import { FamiliesModule } from './modules/families/families.module';
import { GeofencesModule } from './modules/geofences/geofences.module';
import { HealthController } from './modules/health/health.controller';
import { InvitesModule } from './modules/invites/invites.module';
import { LocationStateModule } from './modules/locations/location-state.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RetentionModule } from './modules/retention/retention.module';
import { SosModule } from './modules/sos/sos.module';
import { UsersModule } from './modules/users/users.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({
        pinoHttp: {
          level: cfg.LOG_LEVEL,
          transport: cfg.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
          // Never log credentials; request bodies (which carry coordinates) are not logged at all.
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
        },
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({
        secret: cfg.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS512', issuer: 'de-moi-dity', audience: 'de-moi-dity-app' },
        verifyOptions: { algorithms: ['HS512'], issuer: 'de-moi-dity', audience: 'de-moi-dity-app' },
      }),
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    AccessModule,
    LocationStateModule,
    NotificationsModule,
    RealtimeModule,
    DevicesModule,
    AuthModule,
    UsersModule,
    FamiliesModule,
    InvitesModule,
    GeofencesModule,
    LocationsModule,
    SosModule,
    RetentionModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first so per-user rate limits know the user.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
