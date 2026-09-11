import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

const SCOPE_TYPES = ['ICAO', 'Country', 'Global'] as const;

export class CreateProviderDto {
  // providerId is deliberately NOT accepted here -- it's server-assigned
  // (ReferenceService.nextProviderId()), the same fix already applied to
  // Trip and Client IDs. A manually-typed Provider ID was VIQ's last
  // fully-manual business ID (spec section 40 explicitly calls this out).

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
