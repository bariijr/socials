import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ServiceTypeVariantDto } from './service-type-variant.dto';

const CATEGORIES = ['Permit', 'Handling', 'Other'] as const;

export class CreateServiceTypeDto {
  @IsString()
  code!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceTypeVariantDto)
  variants?: ServiceTypeVariantDto[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
