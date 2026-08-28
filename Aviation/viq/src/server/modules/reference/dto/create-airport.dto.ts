import { IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAirportDto {
  @IsString()
  icao!: string;

  @IsOptional()
  @IsString()
  iata?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsString()
  countryIso2!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tz?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsInt()
  elevationFt?: number;

  @IsOptional()
  @IsInt()
  runwayLengthFt?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsInt()
  fboCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
