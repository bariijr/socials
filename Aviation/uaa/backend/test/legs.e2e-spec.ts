import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { LegsModule } from '../src/legs/legs.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Leg } from '../src/legs/leg.entity';

describe('Legs (e2e)', () => {
  let app: INestApplication;
  let legRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; maximum: jest.Mock };

  beforeAll(async () => {
    legRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      maximum: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [LegsModule],
    })
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /legs creates a leg and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs')
      .send({ tripNo: '2608001', icao: 'GMMN' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '2608001', icao: 'GMMN' }));
  });

  it('GET /legs returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /legs/:id returns 404 when not found', async () => {
    legRepo.findOne.mockResolvedValue(null);

    const response = await request(app.getHttpServer()).get('/legs/missing-id');

    expect(response.status).toBe(404);
  });
});
