import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLegPurposeDto {
  @IsString()
  @MaxLength(200)
  code!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
