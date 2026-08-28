import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateProviderDto } from './create-provider.dto';

export class UpdateProviderDto extends PartialType(OmitType(CreateProviderDto, ['providerId'] as const)) {}
