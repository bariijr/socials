import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
