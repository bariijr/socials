import { Module } from '@nestjs/common';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { PermitAuthorizationsController } from './permit-authorizations.controller';

@Module({
  controllers: [PermitAuthorizationsController],
  providers: [PermitAuthorizationsService],
  exports: [PermitAuthorizationsService],
})
export class PermitAuthorizationsModule {}
