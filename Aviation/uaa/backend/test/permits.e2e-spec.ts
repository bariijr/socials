import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermitsModule } from '../src/permits/permits.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Permits (e2e)', () => {
  let app: INestApplication;
  let permitRequestRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };

  beforeAll(async () => {
    permitRequestRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pr-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const legRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'leg-1',
        legId: 149,
        tripNo: '482421',
        icao: 'HECA',
        tail: 'N148B',
        arrDate: new Date('2026-09-16T16:20:00.000Z'),
      }),
    };
    const countryRequirementRepo = {
      findOne: jest.fn().mockResolvedValue({
        country: 'Egypt',
        leadTimeHours: 96,
        workingDaysOnly: true,
        submissionEmail: 'permits.eg@example.com',
      }),
    };
    const formTemplateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };

    const moduleRef = await Test.createTestingModule({
      imports: [PermitsModule],
    })
      .overrideProvider(getRepositoryToken(PermitRequest))
      .useValue(permitRequestRepo)
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

  it('POST /legs/:legId/permit-requests creates and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ country: 'Egypt', status: 'REQUESTED' }));
  });

  it('GET /legs/:legId/permit-requests returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs/leg-1/permit-requests');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('PATCH /permit-requests/:id updates status', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', status: 'REQUESTED' });

    const response = await request(app.getHttpServer())
      .patch('/permit-requests/pr-1')
      .send({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('GET /permit-requests returns all requests with urgency and leg summary', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null },
    ]);

    const response = await request(app.getHttpServer()).get('/permit-requests');

    expect(response.status).toBe(200);
    expect(response.body[0]).toEqual(expect.objectContaining({ id: 'pr-1', urgency: 'OK' }));
  });

  it('POST /permit-requests/:id/comms files a manual inbound reply', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', legId: 'leg-1', correlationToken: '149/pr-1' });

    const response = await request(app.getHttpServer())
      .post('/permit-requests/pr-1/comms')
      .send({ fromAddress: 'permits.eg@example.com', subject: 'RE: Permit', body: 'Confirmed.' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'INBOUND' }));
  });
});
