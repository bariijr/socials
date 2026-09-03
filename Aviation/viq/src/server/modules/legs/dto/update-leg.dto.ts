import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsInt } from 'class-validator';
import { CreateLegDto } from './create-leg.dto';

export class UpdateLegDto extends PartialType(OmitType(CreateLegDto, ['legId', 'tripId'] as const)) {
  @IsInt()
  version!: number;
}
