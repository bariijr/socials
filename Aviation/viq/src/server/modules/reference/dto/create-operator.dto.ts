import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

const OPERATOR_STATUSES = ['Active', 'Inactive'] as const;

export class CreateOperatorDto {
  @IsString()
  @MaxLength(200)
  operatorId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsIn(OPERATOR_STATUSES)
  status?: (typeof OPERATOR_STATUSES)[number];

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
