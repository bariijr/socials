import {
  Injectable, UnauthorizedException, BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Session } from '../users/entities/session.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      select: ['id', 'email', 'password', 'role', 'status', 'firstName', 'lastName',
               'failedLoginAttempts', 'lockedUntil', 'notificationPreferences', 'language'],
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(`Account locked until ${user.lockedUntil.toISOString()}`);
    }

    const isValid = await user.validatePassword(dto.password);
    if (!isValid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updates: Partial<User> = { failedLoginAttempts: attempts } as any;
      if (attempts >= 5) {
        updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000) as any;
      }
      await this.userRepo.update(user.id, updates);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }

    // Reset failed attempts
    await this.userRepo.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastLoginDevice: userAgent,
    } as any);

    const tokens = await this.generateTokens(user);

    const expiresIn = this.configService.get<string>('security.jwtRefreshExpiresIn');
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));

    await this.sessionRepo.save({
      userId: user.id,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      userAgent,
      deviceFingerprint: dto.deviceFingerprint,
      expiresAt,
      lastActivityAt: new Date(),
    });

    return { user: this.sanitizeUser(user), ...tokens };
  }

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new ConflictException('Email already registered');

    const user = this.userRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      role: UserRole.USER,
      status: UserStatus.PENDING,
      notificationPreferences: { email: true, sms: true, whatsapp: false, push: true },
    });

    await this.userRepo.save(user);
    return { message: 'Registration successful. Await account activation.' };
  }

  async logout(token: string) {
    await this.sessionRepo.update({ token }, { isActive: false });
    return { message: 'Logged out successfully' };
  }

  async refreshToken(refreshToken: string, ip: string) {
    const session = await this.sessionRepo.findOne({
      where: { refreshToken, isActive: true },
      relations: ['user'],
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    const tokens = await this.generateTokens(session.user);
    await this.sessionRepo.update(session.id, {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      lastActivityAt: new Date(),
    });

    return tokens;
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('security.jwtSecret'),
        expiresIn: this.configService.get('security.jwtExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('security.jwtRefreshSecret'),
        expiresIn: this.configService.get('security.jwtRefreshExpiresIn'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User) {
    const { password, ...safe } = user as any;
    return safe;
  }

  private parseDuration(duration: string): number {
    const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 86400000;
    return parseInt(match[1]) * (map[match[2]] || 1000);
  }
}
