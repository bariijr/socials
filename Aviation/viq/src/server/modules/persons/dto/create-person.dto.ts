import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';

const PERSON_ROLES = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
] as const;

export class CreatePersonDto {
  @IsString()
  @MaxLength(200)
  personId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(PERSON_ROLES)
  defaultRole?: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenceNumber?: string;

  @IsOptional()
  @IsDateString()
  medicalValidUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  medicalClass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  medicalExaminer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  passportNationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  passportIssuingCountry?: string;

  @IsOptional()
  @IsDateString()
  passportExpiryDate?: string;

  @IsOptional()
  @IsDateString()
  passportDateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  passportSex?: string;

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

export { PERSON_ROLES };
