import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateLegPurposeDto } from './create-leg-purpose.dto';

export class UpdateLegPurposeDto extends PartialType(OmitType(CreateLegPurposeDto, ['code'] as const)) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
