import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

const SCOPE_TYPES = ['ICAO', 'Country', 'Global'] as const;

export class CreateProviderDto {
  @IsString()
  @MaxLength(200)
  providerId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  serviceTypes!: string[];

  @IsIn(SCOPE_TYPES)
  scopeType!: (typeof SCOPE_TYPES)[number];

  @IsString()
  scope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workingHoursZ?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsInt()
  rating?: number;

  @IsOptional()
  @IsBoolean()
  contractActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactChannelDto)
  channels?: ContactChannelDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
