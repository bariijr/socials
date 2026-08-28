import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAirportDto } from './create-airport.dto';

export class UpdateAirportDto extends PartialType(OmitType(CreateAirportDto, ['icao'] as const)) {}
