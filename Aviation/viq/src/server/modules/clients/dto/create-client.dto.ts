import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

export class CreateClientDto {
  @IsString()
  @MaxLength(200)
  clientId!: string;

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
