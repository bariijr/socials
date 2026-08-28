import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @MaxLength(200)
  iso2!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  iso3?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subRegion?: string;

  @IsOptional()
  @IsBoolean()
  overflightPermitRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  landingPermitRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  aocDocsRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  ciqRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  escalationContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caaWebsite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsNumber()
  centroidLat!: number;

  @IsNumber()
  centroidLng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
