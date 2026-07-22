import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '@/config/configuration';
import { User } from '@/modules/users/entities/user.entity';
import { Organization } from '@/modules/organizations/entities/organization.entity';
import { OrganizationUser } from '@/modules/organizations/entities/organization-user.entity';
import { AccountLimit } from '@/modules/organizations/entities/account-limit.entity';
import { Wallet } from '@/modules/billing/entities/wallet.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OrgRole, OrgStatus, UserStatus } from '@/common/enums';

const BCRYPT_ROUNDS = 12;

export interface AuthResponse {
  accessToken: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: OrgRole;
  organizationId: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(OrganizationUser) private readonly orgUsers: Repository<OrganizationUser>,
    @InjectRepository(AccountLimit) private readonly accountLimits: Repository<AccountLimit>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(PasswordReset) private readonly passwordResets: Repository<PasswordReset>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResponse> {
    const user = await this.users.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'passwordHash', 'status', 'isSuperAdmin', 'firstName', 'lastName'],
    });

    const valid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    if (user.status === UserStatus.CLOSED) throw new UnauthorizedException('Account closed');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Account suspended');

    const membership = await this.orgUsers.findOne({
      where: { userId: user.id, isDefault: true },
    });

    await this.users.update(user.id, { lastLoginAt: new Date(), lastLoginIp: ipAddress });

    return this.buildAuthResponse(user, membership?.organizationId ?? '', membership?.role ?? OrgRole.MEMBER);
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingEmail = await this.users.findOne({ where: { email: dto.email } });
    if (existingEmail) throw new ConflictException('Email already registered');

    const existingSlug = await this.orgs.findOne({ where: { slug: dto.organizationSlug } });
    if (existingSlug) throw new ConflictException('Organization slug already taken');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.dataSource.transaction(async (mgr) => {
      const org = mgr.create(Organization, {
        slug: dto.organizationSlug,
        name: dto.organizationName,
        email: dto.email,
        status: OrgStatus.ACTIVE,
      });
      await mgr.save(org);

      await mgr.save(mgr.create(AccountLimit, { organizationId: org.id }));
      await mgr.save(mgr.create(Wallet, { organizationId: org.id }));

      const user = mgr.create(User, {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName ?? '',
        lastName: dto.lastName ?? '',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      });
      await mgr.save(user);

      await mgr.save(mgr.create(OrganizationUser, {
        organizationId: org.id,
        userId: user.id,
        role: OrgRole.OWNER,
        isDefault: true,
      }));

      return this.buildAuthResponse(user, org.id, OrgRole.OWNER);
    });
  }

  async forgotPassword(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user) return { message: 'If that email exists, a reset link has been sent' };

    const token = uuidv4();
    const tokenHash = this.sha256(token);

    await this.passwordResets
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('user_id = :userId AND used_at IS NULL', { userId: user.id })
      .execute();

    await this.passwordResets.save({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // TODO: Send email via messaging service
    console.log(`[Auth] Password reset token for ${email}: ${token}`);
    return { message: 'If that email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.sha256(token);
    const reset = await this.passwordResets.findOne({
      where: { tokenHash },
      select: ['id', 'userId', 'expiresAt', 'usedAt'],
    });

    if (!reset || reset.usedAt) throw new BadRequestException('Invalid or expired reset token');
    if (reset.expiresAt < new Date()) throw new BadRequestException('Token expired');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.passwordResets.update(reset.id, { usedAt: new Date() });
    await this.users.update(reset.userId, { passwordHash });

    return { message: 'Password reset successful. You can now log in.' };
  }

  private buildAuthResponse(user: Partial<User>, organizationId: string, role: OrgRole): AuthResponse {
    const { accessTtlMinutes } = this.config.get('jwt', { infer: true });

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId,
      role,
      isSuperAdmin: user.isSuperAdmin ?? false,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: `${accessTtlMinutes}m` });

    return {
      accessToken,
      userId: user.id!,
      email: user.email!,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      role,
      organizationId,
      isSuperAdmin: user.isSuperAdmin ?? false,
    };
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
