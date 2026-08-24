import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { ServiceCaseStatus } from '../../service-cases/service-case.entity';
import type { Responsibility, ServiceType } from '../../service-cases/requirement.entity';

const STATUSES: ServiceCaseStatus[] = [
  'NOT_STARTED',
  'REQUESTED',
  'CHASING',
  'CONFIRMED',
  'RECONFIRM_REQUIRED',
  'CANCELLED',
];

const RESPONSIBILITIES: Responsibility[] = [
  'OUR_ARRANGEMENT',
  'CLIENT_ARRANGEMENT',
  'OPERATOR_ARRANGEMENT',
  'THIRD_PARTY_ARRANGEMENT',
  'NOT_REQUIRED',
  'WAIVED',
  'TBD',
];

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

export class UpdatePermitRequestDto {
  @IsOptional() @IsIn(STATUSES) status?: ServiceCaseStatus;
  @IsOptional() @IsString() clearanceNumber?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsIn(RESPONSIBILITIES) responsibility?: Responsibility;
  @IsOptional() @IsIn(SERVICE_TYPES) serviceType?: ServiceType;
}
