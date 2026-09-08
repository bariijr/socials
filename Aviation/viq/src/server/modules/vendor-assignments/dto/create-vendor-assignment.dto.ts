import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVendorAssignmentDto {
  @IsString()
  @MaxLength(200)
  providerId!: string;

  @IsOptional()
  @IsString()
  countryIso2?: string;

  @IsOptional()
  @IsString()
  icao?: string;

  @IsString()
  @MaxLength(200)
  serviceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  permitType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsBoolean()
  prohibited?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
