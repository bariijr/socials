import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePersonDto } from './create-person.dto';

export class UpdatePersonDto extends PartialType(OmitType(CreatePersonDto, ['personId'] as const)) {}
