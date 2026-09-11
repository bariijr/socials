import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';

// clientId was never part of CreateClientDto's writable surface (it's
// server-assigned), so there's nothing left to Omit here.
export class UpdateClientDto extends PartialType(CreateClientDto) {}
