import { IsOptional, IsString } from 'class-validator';

// entityLinks arrives as a JSON-encoded string, not a nested array — this
// endpoint is multipart/form-data (file upload), and multipart fields are
// always flat strings; DocumentsService.upload() parses and validates it.
// Example value: '[{"entityType":"Trip","entityId":"TRIP-1AB2C3"}]'
export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsString()
  entityLinks!: string;

  @IsString()
  uploadedBy!: string;
}
