import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRatingDto {
  @IsString()
  @MaxLength(200)
  personId!: string;

  @IsString()
  @MaxLength(200)
  ratingType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingAuthority?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
