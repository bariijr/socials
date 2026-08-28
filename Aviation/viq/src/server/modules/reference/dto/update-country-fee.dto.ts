import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryFeeDto } from './create-country-fee.dto';

export class UpdateCountryFeeDto extends PartialType(OmitType(CreateCountryFeeDto, ['countryIso2'] as const)) {}
