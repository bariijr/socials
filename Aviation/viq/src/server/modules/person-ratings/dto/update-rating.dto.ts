import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRatingDto } from './create-rating.dto';

export class UpdateRatingDto extends PartialType(OmitType(CreateRatingDto, ['personId'] as const)) {}
