import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitVendorCapabilityResponseDto {
  @IsString()
  @MaxLength(200)
  contactName!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsBoolean()
  canService!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vendorNotes?: string;
}
