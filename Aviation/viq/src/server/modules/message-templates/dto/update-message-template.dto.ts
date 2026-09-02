import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMessageTemplateDto } from './create-message-template.dto';

export class UpdateMessageTemplateDto extends PartialType(OmitType(CreateMessageTemplateDto, ['countryIso2', 'templateType'] as const)) {}
