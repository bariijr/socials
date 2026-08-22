import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns the user when username exists and password matches', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    userRepo.findOne.mockResolvedValue({ id: '1', username: 'bminja', passwordHash: hash });

    const result = await service.validateUser('bminja', 'correct-horse');

    expect(result).toEqual(expect.objectContaining({ username: 'bminja' }));
  });

  it('returns null when the password does not match', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    userRepo.findOne.mockResolvedValue({ id: '1', username: 'bminja', passwordHash: hash });

    const result = await service.validateUser('bminja', 'wrong-password');

    expect(result).toBeNull();
  });

  it('returns null when the username does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    const result = await service.validateUser('nobody', 'anything');

    expect(result).toBeNull();
  });

  it('issues a signed access token for a validated user', async () => {
    const user = { id: '1', username: 'bminja' } as User;

    const result = await service.login(user);

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
