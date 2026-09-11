import { PartialType } from '@nestjs/mapped-types';
import { CreateProviderDto } from './create-provider.dto';

// providerId was never part of CreateProviderDto's writable surface (it's
// server-assigned), so there's nothing left to Omit here.
export class UpdateProviderDto extends PartialType(CreateProviderDto) {}
