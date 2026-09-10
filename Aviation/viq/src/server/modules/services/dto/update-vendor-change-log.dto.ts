import { IsString, MaxLength } from 'class-validator';

export class UpdateVendorChangeLogDto {
  @IsString()
  @MaxLength(200)
  newRequestCommId!: string;
}
