import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

export class CreateTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tripId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerUserId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  noLaterThanZ?: string;
}
