import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateVendorAssignmentDto } from './create-vendor-assignment.dto';

export class UpdateVendorAssignmentDto extends PartialType(
  OmitType(CreateVendorAssignmentDto, ['providerId', 'serviceType'] as const),
) {}
