import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateServiceDto } from './create-service.dto';

export class UpdateServiceDto extends PartialType(OmitType(CreateServiceDto, ['svcId', 'tripId'] as const)) {}
