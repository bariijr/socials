import { Module } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { VendorAssignmentsController } from './vendor-assignments.controller';
import { VendorResolverService } from './vendor-resolver.service';

@Module({
  controllers: [VendorAssignmentsController],
  providers: [VendorAssignmentsService, VendorResolverService],
  exports: [VendorAssignmentsService, VendorResolverService],
})
export class VendorAssignmentsModule {}
