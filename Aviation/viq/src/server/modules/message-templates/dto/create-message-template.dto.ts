import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const COUNTRY_AWARE_TEMPLATE_TYPES = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision',
  'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
] as const;

export class CreateMessageTemplateDto {
  @IsString()
  @MaxLength(200)
  countryIso2!: string;

  @IsIn(COUNTRY_AWARE_TEMPLATE_TYPES)
  templateType!: (typeof COUNTRY_AWARE_TEMPLATE_TYPES)[number];

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}

export { COUNTRY_AWARE_TEMPLATE_TYPES };
