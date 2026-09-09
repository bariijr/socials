import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { VendorAssignmentsModule } from '../vendor-assignments/vendor-assignments.module';

@Module({
  imports: [VendorAssignmentsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
