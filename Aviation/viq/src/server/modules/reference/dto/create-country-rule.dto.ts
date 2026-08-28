import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCountryRuleDto {
  @IsString()
  @MaxLength(200)
  countryIso2!: string;

  @IsString()
  @MaxLength(200)
  serviceType!: string;

  @IsInt()
  leadTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  workingDaysOnly?: boolean;

  @IsOptional()
  @IsInt()
  toleranceHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  exceptionAirports?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  docsRequired?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
