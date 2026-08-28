import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PERSON_ROLES } from './create-person.dto';

export class AssignAllLegsDto {
  @IsString()
  tripId!: string;

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
