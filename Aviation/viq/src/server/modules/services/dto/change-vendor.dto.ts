import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export const VENDOR_CHANGE_REASONS = [
  'Client Requested', 'Vendor Unavailable', 'No Response', 'Price', 'Credit Issue',
  'Operational Requirement', 'Capability Issue', 'Schedule Issue', 'Quality Issue', 'Other',
] as const;

export class ChangeVendorDto {
  @IsString()
  @MaxLength(200)
  toProviderId!: string;

  @IsIn(VENDOR_CHANGE_REASONS)
  reason!: (typeof VENDOR_CHANGE_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsString()
  @MaxLength(200)
  cancellationCommId!: string;

  @IsInt()
  version!: number;
}
