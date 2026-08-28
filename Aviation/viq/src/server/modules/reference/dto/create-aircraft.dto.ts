import { IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAircraftDto {
  @IsString()
  @MaxLength(200)
  registration!: string;

  @IsString()
  @MaxLength(200)
  icaoType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturerOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  modelOverride?: string;

  @IsOptional()
  @IsNumber()
  mtowOverrideKg?: number;

  @IsOptional()
  @IsNumber()
  maxRangeOverrideNm?: number;

  @IsOptional()
  @IsNumber()
  fuelBurnOverrideKgPerHour?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  noiseCertOverride?: string;

  @IsString()
  @MaxLength(200)
  currentOperatorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  colors?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  operationType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  previousOperators?: string[];

  @IsOptional()
  @IsInt()
  yearOfManufacture?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serialNumber?: string;

  @IsOptional()
  @IsDateString()
  insuranceValidUntil?: string;

  @IsOptional()
  @IsDateString()
  airworthinessValidUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  homeBaseIcao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
