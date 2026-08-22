import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { PermitRequestStatus } from '../permit-request.entity';

const STATUSES: PermitRequestStatus[] = [
  'NOT_STARTED',
  'REQUESTED',
  'CHASING',
  'CONFIRMED',
  'RECONFIRM_REQUIRED',
  'CANCELLED',
];

export class UpdatePermitRequestDto {
  @IsOptional() @IsIn(STATUSES) status?: PermitRequestStatus;
  @IsOptional() @IsString() clearanceNumber?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
