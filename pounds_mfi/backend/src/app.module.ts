import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';

import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LoansModule } from './modules/loans/loans.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { DisbursementsModule } from './modules/disbursements/disbursements.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { BackupsModule } from './modules/backups/backups.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [join(__dirname, '**/*.entity{.ts,.js}')],
        migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
        synchronize: config.get('database.sync'),
        logging: config.get('database.logging'),
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        pool: {
          max: 20,
          min: 2,
          acquire: 30000,
          idle: 10000,
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: config.get('rateLimit.ttl') * 1000,
          limit: config.get('rateLimit.max'),
        }],
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
    }),

    ScheduleModule.forRoot(),

    AuthModule,
    UsersModule,
    KycModule,
    LoansModule,
    ReceiptsModule,
    DisbursementsModule,
    NotificationsModule,
    DashboardModule,
    SettingsModule,
    AuditModule,
    BackupsModule,
    OcrModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
