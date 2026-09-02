import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt,
  IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

const SERVICE_TYPES = ['Permit', 'Overflight', 'GroundHandling'] as const;
const PERSON_ROLES = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
] as const;

export class QuoteLegDto {
  // Client-side correlation id (e.g. "1", timestamp string) — used to attach
  // services/persons to the right leg; not the final LegID.
  @IsString()
  clientLegId!: string;

  @IsInt()
  seq!: number;

  @IsString()
  depIcao!: string;

  @IsString()
  arrIcao!: string;

  @IsDateString()
  etdZ!: string;

  @IsDateString()
  etaZ!: string;

  @IsOptional()
  @Min(0)
  blockHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countriesOverflown?: string[];

  @IsOptional()
  @IsString()
  callSign?: string;
}

export class QuoteServiceDto {
  @IsString()
  clientLegId!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsString()
  countryIso2!: string;

  @IsInt()
  @Min(0)
  leadTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  auto?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class QuotePersonDto {
  @IsString()
  name!: string;

  @IsIn(PERSON_ROLES)
  role!: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  passportNationality?: string;
}

export class CreateQuoteDto {
  @IsString()
  @MaxLength(200)
  client!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  registration?: string;

  @IsOptional()
  @IsString()
  operationType?: string;

  @IsOptional()
  @IsString()
  missionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuoteLegDto)
  legs!: QuoteLegDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceDto)
  services?: QuoteServiceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotePersonDto)
  persons?: QuotePersonDto[];
}
