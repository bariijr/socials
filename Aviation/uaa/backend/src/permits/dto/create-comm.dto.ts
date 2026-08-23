import { IsString } from 'class-validator';

export class CreateCommDto {
  @IsString()
  fromAddress: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;
}
