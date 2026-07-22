import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppConfig } from '@/config/configuration';
import { User } from '@/modules/users/entities/user.entity';
import { Organization } from '@/modules/organizations/entities/organization.entity';
import { OrganizationUser } from '@/modules/organizations/entities/organization-user.entity';
import { AccountLimit } from '@/modules/organizations/entities/account-limit.entity';
import { Wallet } from '@/modules/billing/entities/wallet.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).accessSecret,
        signOptions: { expiresIn: `${config.get('jwt', { infer: true }).accessTtlMinutes}m` },
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Organization,
      OrganizationUser,
      AccountLimit,
      Wallet,
      PasswordReset,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
