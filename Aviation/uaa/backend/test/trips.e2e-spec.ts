import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripsModule } from '../src/trips/trips.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Trip } from '../src/trips/trip.entity';
import { Leg } from '../src/legs/leg.entity';

describe('Trips (e2e)', () => {
  let app: INestApplication;
  let tripRepo: { findOne: jest.Mock };
  let legRepo: { find: jest.Mock };

  beforeAll(async () => {
    tripRepo = { findOne: jest.fn() };
    legRepo = { find: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      imports: [TripsModule],
    })
      .overrideProvider(getRepositoryToken(Trip))
      .useValue(tripRepo)
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

  it('GET /trips/:tripNo returns 404 when the trip does not exist', async () => {
    tripRepo.findOne.mockResolvedValue(null);

    const response = await request(app.getHttpServer()).get('/trips/missing');

    expect(response.status).toBe(404);
  });

  it('GET /trips/:tripNo returns the trip workspace', async () => {
    tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '484701' });
    legRepo.find.mockResolvedValue([
      { id: 'leg-1', legId: 1, tail: 'N221RW', operatorName: 'ACME', country: 'Nigeria', depDate: null, arrDate: null, completedAt: null },
    ]);

    const response = await request(app.getHttpServer()).get('/trips/484701');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '484701', legCount: 1, status: 'ACTIVE' }));
  });
});
