import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

const TRIP_STATUSES = ['Planning', 'Active', 'Complete', 'Cancelled'] as const;

export class CreateTripDto {
  @IsString()
  @MaxLength(200)
  tripId!: string;

  @IsString()
  @MaxLength(200)
  client!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  operator?: string;

  @IsOptional()
  @IsString()
  registration?: string;

  @IsOptional()
  @IsIn(TRIP_STATUSES)
  status?: (typeof TRIP_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  team?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supportRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  billToAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billToAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billToAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billToCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billToState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billToPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billToCountry?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  billToEmails?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  operationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  missionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  aircraftIcaoType?: string;

  @IsOptional()
  @IsNumber()
  aircraftMtowKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aircraftSerialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string; // acting user, for audit log attribution
}
