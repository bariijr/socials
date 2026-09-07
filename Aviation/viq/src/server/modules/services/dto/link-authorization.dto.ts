import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class LinkAuthorizationDto {
  @IsString()
  @MaxLength(200)
  authorizationId!: string;

  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
