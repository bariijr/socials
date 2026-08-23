import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from './leg.entity';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';
import { PermitsModule } from '../permits/permits.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TypeOrmModule.forFeature([Leg]), PermitsModule, TripsModule],
  providers: [LegsService],
  controllers: [LegsController],
  exports: [LegsService],
})
export class LegsModule {}
