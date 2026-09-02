import { IsDateString, IsIn, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const PURPOSES = ['Tech', 'Night', 'CrewChange', 'Passenger'] as const;

export class CreateStopDto {
  @IsString()
  @MaxLength(200)
  stopId!: string;

  @IsString()
  @MaxLength(200)
  tripId!: string;

  @IsString()
  icao!: string;

  @IsDateString()
  arrZ!: string;

  @IsDateString()
  depZ!: string;

  @IsOptional()
  @Min(0)
  groundTimeHours?: number;

  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
