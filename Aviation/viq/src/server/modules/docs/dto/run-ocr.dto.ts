import { IsOptional, IsString } from 'class-validator';

// `password` is only ever used in-memory for one decrypt-and-read pass
// against a protected PDF — it is never persisted to the DocAttachment row.
export class RunOcrDto {
  @IsOptional()
  @IsString()
  password?: string;
}
