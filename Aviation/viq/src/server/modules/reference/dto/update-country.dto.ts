import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryDto } from './create-country.dto';

export class UpdateCountryDto extends PartialType(OmitType(CreateCountryDto, ['iso2'] as const)) {}
