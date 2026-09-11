import { Module } from '@nestjs/common';
import { VendorCapabilityService } from './vendor-capability.service';
import { VendorCapabilityController } from './vendor-capability.controller';

@Module({
  controllers: [VendorCapabilityController],
  providers: [VendorCapabilityService],
  exports: [VendorCapabilityService],
})
export class VendorCapabilityModule {}
