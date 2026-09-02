import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const;
const STATUSES = ['Draft', 'Queued', 'Sent', 'Failed', 'Received'] as const;

export class CreateCommDto {
  @IsString()
  @MaxLength(200)
  commId!: string;

  @IsIn(DIRECTIONS)
  direction!: (typeof DIRECTIONS)[number];

  @IsString()
  @MaxLength(200)
  tripId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  svcId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @IsString()
  @MaxLength(200)
  from!: string;

  @IsString()
  @MaxLength(200)
  to!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
