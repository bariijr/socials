import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { ServicesModule } from '../services/services.module';
import { LegsModule } from '../legs/legs.module';
import { OperationalEventsModule } from '../operational-events/operational-events.module';

@Module({
  imports: [ServicesModule, LegsModule, OperationalEventsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
