import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsInt } from 'class-validator';
import { CreateTripDto } from './create-trip.dto';

export class UpdateTripDto extends PartialType(OmitType(CreateTripDto, ['tripId'] as const)) {
  // The version this update was read against -- required on every update,
  // never part of CreateTripDto (a new Trip always starts at version 1,
  // server-assigned, never client-supplied).
  @IsInt()
  version!: number;
}
