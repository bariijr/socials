import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

export class CreateClientDto {
  // clientId is deliberately NOT accepted here -- it used to be caller-
  // supplied (frontend generated `CLI-${Date.now()}`), which was a live
  // race condition: two creates in the same millisecond collide on this
  // model's primary key. ClientsService.create() now assigns it via an
  // atomic counter, the same fix already applied to Trip IDs.

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isOperator?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkedOperatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

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
