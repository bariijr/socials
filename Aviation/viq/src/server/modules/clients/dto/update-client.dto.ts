import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(OmitType(CreateClientDto, ['clientId'] as const)) {}
