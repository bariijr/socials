import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryRuleDto } from './create-country-rule.dto';

export class UpdateCountryRuleDto extends PartialType(OmitType(CreateCountryRuleDto, ['countryIso2', 'serviceType'] as const)) {}
