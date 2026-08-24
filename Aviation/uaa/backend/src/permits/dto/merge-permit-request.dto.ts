import { IsString } from 'class-validator';

export class MergePermitRequestDto {
  @IsString()
  requirementId: string;
}
