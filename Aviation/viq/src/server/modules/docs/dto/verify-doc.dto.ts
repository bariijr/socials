import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

class VerifiedFieldDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;
}

export class VerifyDocDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerifiedFieldDto)
  verifiedFields!: VerifiedFieldDto[];

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsString()
  verifiedBy!: string;
}
