import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PERSON_ROLES } from './create-person.dto';

export class AssignPersonDto {
  @IsString()
  legId!: string;

  @IsIn(PERSON_ROLES)
  role!: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  hotel?: string;

  @IsOptional()
  @IsDateString()
  commercialFlightEta?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
