import { IsDateString } from 'class-validator';

export class ExportLegsQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
