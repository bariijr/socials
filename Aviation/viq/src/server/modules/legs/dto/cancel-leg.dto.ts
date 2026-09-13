import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { CANCELLATION_REASONS } from '../../../common/cancellationReasons';

export class CancelLegDto {
  @IsIn(CANCELLATION_REASONS)
  reason!: (typeof CANCELLATION_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
