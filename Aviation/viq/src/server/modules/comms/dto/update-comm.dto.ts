import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCommDto } from './create-comm.dto';

export class UpdateCommDto extends PartialType(OmitType(CreateCommDto, ['commId', 'tripId'] as const)) {}
