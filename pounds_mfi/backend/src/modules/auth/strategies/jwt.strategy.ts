import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';
import { Session } from '../../users/entities/session.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('security.jwtSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    const session = await this.sessionRepo.findOne({
      where: { token, isActive: true },
    });

    if (!session) throw new UnauthorizedException('Session expired or invalid');

    const timeout = this.configService.get<number>('security.sessionInactivityTimeout');
    if (session.lastActivityAt) {
      const elapsed = (Date.now() - session.lastActivityAt.getTime()) / 1000;
      if (elapsed > timeout) {
        await this.sessionRepo.update(session.id, { isActive: false });
        throw new UnauthorizedException('Session expired due to inactivity');
      }
    }

    // Update last activity
    await this.sessionRepo.update(session.id, { lastActivityAt: new Date() });

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is not active');
    }

    return { ...user, sessionId: session.id };
  }
}
