import { Module } from '@nestjs/common';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';
import { ServicesModule } from '../services/services.module';
import { StopsModule } from '../stops/stops.module';

@Module({
  imports: [ServicesModule, StopsModule],
  controllers: [LegsController],
  providers: [LegsService],
  exports: [LegsService],
})
export class LegsModule {}
