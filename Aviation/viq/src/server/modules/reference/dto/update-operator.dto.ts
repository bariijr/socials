import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateOperatorDto } from './create-operator.dto';

export class UpdateOperatorDto extends PartialType(OmitType(CreateOperatorDto, ['operatorId'] as const)) {}
