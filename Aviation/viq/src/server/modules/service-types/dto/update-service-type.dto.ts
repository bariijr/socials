import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateServiceTypeDto } from './create-service-type.dto';

export class UpdateServiceTypeDto extends PartialType(OmitType(CreateServiceTypeDto, ['code'] as const)) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
