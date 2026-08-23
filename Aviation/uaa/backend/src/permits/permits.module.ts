import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermitRequest } from './permit-request.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';
import { ReconfirmSweepService } from './reconfirm-sweep.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PermitRequest, Comm, Leg, CountryRequirement, FormTemplate]),
    MailModule,
  ],
  providers: [PermitsService, ReconfirmSweepService],
  controllers: [PermitsController],
  exports: [PermitsService],
})
export class PermitsModule {}
