import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermitsModule } from '../src/permits/permits.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Permits (e2e)', () => {
  let app: INestApplication;
  let requirementRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let requirementLegRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let serviceCaseRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceOrderRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };

  beforeAll(async () => {
    requirementRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'req-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null }),
    };
    requirementLegRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'rl-1', ...entity })),
      find: jest.fn().mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]),
    };
    serviceCaseRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'sc-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    serviceOrderRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'so-1', ...entity })),
      findOne: jest.fn().mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: 'permits.eg@example.com', correlationToken: '149/sc-1' }),
    };
    const legRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'leg-1', legId: 149, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
        arrDate: new Date('2026-09-16T16:20:00.000Z'),
      }),
      find: jest.fn().mockResolvedValue([{ id: 'leg-1', tripId: 'trip-1' }]),
    };
    const countryRequirementRepo = {
      findOne: jest.fn().mockResolvedValue({ country: 'Egypt', serviceType: 'OVERFLIGHT', leadTimeHours: 96, workingDaysOnly: true, submissionEmail: 'permits.eg@example.com' }),
    };
    const formTemplateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };

    const moduleRef = await Test.createTestingModule({
      imports: [PermitsModule],
    })
      .overrideProvider(getRepositoryToken(Requirement))
      .useValue(requirementRepo)
      .overrideProvider(getRepositoryToken(RequirementLeg))
      .useValue(requirementLegRepo)
      .overrideProvider(getRepositoryToken(ServiceCase))
      .useValue(serviceCaseRepo)
      .overrideProvider(getRepositoryToken(ServiceOrder))
      .useValue(serviceOrderRepo)
      .overrideProvider(getRepositoryToken(Comm))
      .useValue(commRepo)
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue(countryRequirementRepo)
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue(formTemplateRepo)
      .overrideProvider(MailService)
      .useValue({ send: jest.fn().mockResolvedValue({ sent: true }) })
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

  it('POST /legs/:legId/permit-requests requires serviceType and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt', serviceType: 'OVERFLIGHT' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ country: 'Egypt', serviceType: 'OVERFLIGHT', legIds: ['leg-1'] }));
  });

  it('POST /legs/:legId/permit-requests rejects an invalid serviceType', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt', serviceType: 'BOGUS' });

    expect(response.status).toBe(400);
  });

  it('GET /legs/:legId/permit-requests/compatible returns { candidate: null } when nothing matches', async () => {
    requirementLegRepo.find.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .get('/legs/leg-1/permit-requests/compatible?country=Egypt&serviceType=OVERFLIGHT');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ candidate: null });
  });

  it('POST /legs/:legId/permit-requests/merge adds the leg and returns the updated request', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-2' }]);

    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests/merge')
      .send({ requirementId: 'req-1' });

    expect(response.status).toBe(201);
    expect(requirementLegRepo.save).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
  });

  it('PATCH /permit-requests/:id updates status', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });

    const response = await request(app.getHttpServer())
      .patch('/permit-requests/sc-1')
      .send({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('GET /permit-requests returns all requests with urgency and leg summary', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const response = await request(app.getHttpServer()).get('/permit-requests');

    expect(response.status).toBe(200);
    expect(response.body[0]).toEqual(expect.objectContaining({ id: 'sc-1', urgency: 'OK' }));
  });

  it('POST /permit-requests/:id/comms files a manual inbound reply', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1' });

    const response = await request(app.getHttpServer())
      .post('/permit-requests/sc-1/comms')
      .send({ fromAddress: 'permits.eg@example.com', subject: 'RE: Permit', body: 'Confirmed.' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'INBOUND' }));
  });
});
