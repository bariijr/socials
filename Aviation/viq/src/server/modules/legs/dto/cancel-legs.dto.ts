import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CANCELLATION_REASONS } from '../../../common/cancellationReasons';

// No per-Leg `version` here -- cancelLegs() reads each Leg's current
// version immediately before its own write, the same no-caller-pinned-
// version convention ServicesService.flagConfirmedServices already uses
// for its own multi-row writes (see the design doc §5's ruling).
export class CancelLegsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  legIds!: string[];

  @IsIn(CANCELLATION_REASONS)
  reason!: (typeof CANCELLATION_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
