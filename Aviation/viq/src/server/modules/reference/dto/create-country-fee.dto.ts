import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCountryFeeDto {
  @IsString()
  @MaxLength(200)
  countryIso2!: string;

  @IsString()
  @MaxLength(200)
  feeType!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
