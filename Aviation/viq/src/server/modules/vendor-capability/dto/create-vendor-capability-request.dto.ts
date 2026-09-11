import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVendorCapabilityRequestDto {
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
  user?: string;
}
