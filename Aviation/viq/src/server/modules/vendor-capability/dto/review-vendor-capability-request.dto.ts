import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewVendorCapabilityRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
