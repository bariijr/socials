import { IsIn, IsString } from 'class-validator';
import type { ServiceType } from '../../service-cases/requirement.entity';

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

export class CreatePermitRequestDto {
  @IsString()
  country: string;

  @IsIn(SERVICE_TYPES)
  serviceType: ServiceType;
}
