import { IsIn, IsOptional, IsString } from 'class-validator';

const DOC_TYPES = [
  'Registration Certificate', 'Airworthiness Certificate', 'Insurance Certificate',
  'Permit Application Form', 'AOC', 'Noise Certificate', 'PAX List',
  'Crew Licence', 'Medical Certificate', 'Other',
] as const;

export class UploadDocDto {
  @IsIn(DOC_TYPES)
  docType!: (typeof DOC_TYPES)[number];

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  svcId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  aircraftRegistration?: string;

  @IsString()
  uploadedBy!: string;

  @IsOptional()
  @IsString()
  validUntil?: string;
}
