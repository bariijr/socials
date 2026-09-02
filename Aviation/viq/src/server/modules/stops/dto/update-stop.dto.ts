import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateStopDto } from './create-stop.dto';

export class UpdateStopDto extends PartialType(OmitType(CreateStopDto, ['stopId', 'tripId'] as const)) {}
