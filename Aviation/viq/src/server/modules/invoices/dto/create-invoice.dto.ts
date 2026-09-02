import { IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const STATUSES = ['Draft', 'Sent', 'Viewed', 'Paid', 'Overdue', 'Cancelled'] as const;

export class CreateInvoiceDto {
  @IsString()
  @MaxLength(200)
  invoiceId!: string;

  @IsString()
  @MaxLength(200)
  tripId!: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsDateString()
  issueDateZ!: string;

  @IsDateString()
  dueDateZ!: string;

  @IsArray()
  lineItems!: unknown[];

  @Min(0)
  subtotal!: number;

  @Min(0)
  taxRate!: number;

  @Min(0)
  taxAmount!: number;

  @Min(0)
  total!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sentTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsArray()
  changeLog?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
