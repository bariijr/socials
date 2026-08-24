import { IsUUID } from 'class-validator';

export class MergePermitRequestDto {
  @IsUUID()
  requirementId: string;
}
