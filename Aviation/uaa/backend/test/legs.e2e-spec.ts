import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { LegsModule } from '../src/legs/legs.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Leg } from '../src/legs/leg.entity';
import { PermitsService } from '../src/permits/permits.service';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { Comm } from '../src/permits/comm.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { TripsService } from '../src/trips/trips.service';
import { Trip } from '../src/trips/trip.entity';

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
      .overrideProvider(PermitsService)
      .useValue({ reconcileForLeg: jest.fn() })
      .overrideProvider(getRepositoryToken(Requirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(RequirementLeg))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceCase))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceOrder))
      .useValue({})
      .overrideProvider(getRepositoryToken(Comm))
      .useValue({})
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue({})
      .overrideProvider(TripsService)
      .useValue({ findOrCreateByTripNo: jest.fn().mockResolvedValue({ id: 'trip-1', tripNo: 'trip-1' }) })
      .overrideProvider(getRepositoryToken(Trip))
      .useValue({})
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
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '2608001', icao: 'GMMN', tripId: 'trip-1' }));
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

  it('PATCH /legs/:id updates the leg and returns 200', async () => {
    legRepo.findOne.mockResolvedValue({ id: 'generated-id', tripNo: '2608001', arrDate: new Date('2026-09-16T16:20:00.000Z') });

    const response = await request(app.getHttpServer())
      .patch('/legs/generated-id')
      .send({ arrDate: '2026-09-18T10:00:00.000Z' });

    expect(response.status).toBe(200);
  });

  it('POST /legs/:id/complete marks the leg complete and returns 201', async () => {
    legRepo.findOne.mockResolvedValue({ id: 'generated-id', tripNo: '2608001', completedAt: null });

    const response = await request(app.getHttpServer()).post('/legs/generated-id/complete').send();

    expect(response.status).toBe(201);
    expect(response.body.completedAt).toBeTruthy();
  });

  it('GET /legs/export returns an xlsx file for the date range', async () => {
    legRepo.find.mockResolvedValue([
      { id: '1', tripNo: '475087', icao: 'GMMN', country: 'Morocco', legId: 63, completedAt: new Date('2026-08-15T00:00:00.000Z') },
    ]);

    const response = await request(app.getHttpServer()).get('/legs/export?from=2026-08-01&to=2026-08-31');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
  });
});
