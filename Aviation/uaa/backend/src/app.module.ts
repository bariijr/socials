import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { LegsModule } from './legs/legs.module';
import { PermitsModule } from './permits/permits.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TripsModule } from './trips/trips.module';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    UsersModule,
    AuthModule,
    LegsModule,
    PermitsModule,
    NotificationsModule,
    TripsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
