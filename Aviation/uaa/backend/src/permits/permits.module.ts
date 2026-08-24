import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';
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
    TypeOrmModule.forFeature([Requirement, RequirementLeg, ServiceCase, ServiceOrder, Comm, Leg, CountryRequirement, FormTemplate]),
    forwardRef(() => MailModule),
  ],
  providers: [PermitsService, ReconfirmSweepService],
  controllers: [PermitsController],
  exports: [PermitsService],
})
export class PermitsModule {}
