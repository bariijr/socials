import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const LEG_STATUSES = ['Planned', 'Active', 'Completed', 'Cancelled'] as const;

export class CreateLegDto {
  @IsString()
  @MaxLength(200)
  legId!: string;

  @IsString()
  @MaxLength(200)
  tripId!: string;

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
  @IsInt()
  @Min(0)
  paxCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  crewCount?: number;

  // If omitted, the server computes it from the great-circle route.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countriesOverflown?: string[];

  @IsOptional()
  @IsInt()
  revision?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  callSign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidFirs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeFirs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  routing?: string;

  @IsOptional()
  @IsIn(LEG_STATUSES)
  status?: (typeof LEG_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;

  // Auto-derive Overflight + landing/ground-handling Services for this leg on creation.
  @IsOptional()
  generateServices?: boolean;

  @IsOptional()
  departureGroundHandling?: boolean;
}
