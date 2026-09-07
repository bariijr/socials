import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AUTHORIZATION_TYPES } from './create-permit-authorization.dto';

const SERVICE_TYPES = ['Permit', 'Overflight'] as const;

export class UpdatePermitAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  operatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryIso2?: string;

  @IsOptional()
  @IsIn(SERVICE_TYPES)
  serviceType?: (typeof SERVICE_TYPES)[number];

  @IsOptional()
  @IsIn(AUTHORIZATION_TYPES)
  authorizationType?: (typeof AUTHORIZATION_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referenceNumber?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  docId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
