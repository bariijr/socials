import { Module } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { VendorAssignmentsController } from './vendor-assignments.controller';

@Module({
  controllers: [VendorAssignmentsController],
  providers: [VendorAssignmentsService],
  exports: [VendorAssignmentsService],
})
export class VendorAssignmentsModule {}
