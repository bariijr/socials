import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const SCOPE_TYPES = ['TRIP', 'LEG', 'STOP', 'SEGMENT'] as const;
const SERVICE_STATUSES = [
  'Not Required', 'Not Started', 'Requested', 'Chasing', 'Confirmed', 'Re-confirm Required', 'Cancelled',
] as const;

export class CreateServiceDto {
  @IsString()
  @MaxLength(200)
  svcId!: string;

  @IsString()
  @MaxLength(200)
  tripId!: string;

  @IsIn(SCOPE_TYPES)
  scopeType!: (typeof SCOPE_TYPES)[number];

  @IsString()
  @MaxLength(200)
  scopeId!: string;

  @IsString()
  @MaxLength(200)
  serviceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerId?: string;

  @IsOptional()
  @IsIn(SERVICE_STATUSES)
  status?: (typeof SERVICE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  refNumber?: string;

  @IsDateString()
  basedOnEtdZ!: string;

  @IsDateString()
  requiredByZ!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  subItems?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmedBy?: string;

  @IsOptional()
  @IsDateString()
  confirmedAtZ?: string;

  @IsOptional()
  @IsDateString()
  validityZ?: string;

  @IsOptional()
  @IsBoolean()
  sentToCaptain?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  countryIso2?: string;

  @IsOptional()
  @IsString()
  icao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
