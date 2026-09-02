import { IsString } from 'class-validator';

export class ServiceTypeVariantDto {
  @IsString()
  code!: string;

  @IsString()
  label!: string;
}
