import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAircraftDto } from './create-aircraft.dto';

export class UpdateAircraftDto extends PartialType(OmitType(CreateAircraftDto, ['registration'] as const)) {}
