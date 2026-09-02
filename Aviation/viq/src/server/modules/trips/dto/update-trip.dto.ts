import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTripDto } from './create-trip.dto';

export class UpdateTripDto extends PartialType(OmitType(CreateTripDto, ['tripId'] as const)) {}
