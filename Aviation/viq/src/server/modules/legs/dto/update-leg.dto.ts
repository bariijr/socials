import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateLegDto } from './create-leg.dto';

export class UpdateLegDto extends PartialType(OmitType(CreateLegDto, ['legId', 'tripId'] as const)) {}
