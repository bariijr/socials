import { IsString } from 'class-validator';

export class CreatePermitRequestDto {
  @IsString()
  country: string;
}
