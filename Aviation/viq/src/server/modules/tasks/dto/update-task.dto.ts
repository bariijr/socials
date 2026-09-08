import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

const STATUSES = ['Open', 'In Progress', 'Waiting', 'Complete', 'Cancelled'] as const;

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  escalationTier?: string;
}
