import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const SERVICE_TYPES = ['Permit', 'Overflight'] as const;
export const AUTHORIZATION_TYPES = ['Blanket', 'Block', 'Seasonal'] as const;

export class CreatePermitAuthorizationDto {
  @IsString()
  @MaxLength(200)
  operatorId!: string;

  @IsString()
  @MaxLength(10)
  countryIso2!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsIn(AUTHORIZATION_TYPES)
  authorizationType!: (typeof AUTHORIZATION_TYPES)[number];

  @IsString()
  @MaxLength(200)
  referenceNumber!: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validUntil!: string;

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
