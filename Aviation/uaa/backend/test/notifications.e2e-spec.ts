import { Test } from '@nestjs/testing';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Leg } from '../src/legs/leg.entity';
import { Team } from '../src/notifications/team.entity';
import { Comm } from '../src/permits/comm.entity';
import { User } from '../src/users/user.entity';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Notifications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const leg = {
      id: 'leg-1',
      tail: 'N148B',
      tripNo: '482421',
      icao: 'HECA',
      country: 'Egypt',
      arrDate: new Date('2026-09-16T16:20:00.000Z'),
      depDate: new Date('2026-09-17T15:00:00.000Z'),
      captName: 'ADAM HEBERT',
      captEmail: 'adam@example.com',
      agentName: 'Hicham Bentouzer',
      agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
      tssTeam: 'X-Ray',
    };
    const legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    const teamRepo = { findOne: jest.fn().mockResolvedValue({ id: 'team-1', name: 'X-RAY', teamEmail: 'xrayteam@univ-wea.com' }) };
    const commRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        fullName: 'Barnaba Minja',
        jobTitle: 'A2G Coordinator',
        mobile: '+255 713 000 000',
        fromEmail: 'bminja@univ-wea.com',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideProvider(getRepositoryToken(Team))
      .useValue(teamRepo)
      .overrideProvider(getRepositoryToken(Comm))
      .useValue(commRepo)
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepo)
      .overrideProvider(getRepositoryToken(Requirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(RequirementLeg))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceCase))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceOrder))
      .useValue({})
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue({})
      .overrideProvider(MailService)
      .useValue({ send: jest.fn().mockResolvedValue({ sent: true }) })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { userId: 'user-1', username: 'testuser' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /legs/:legId/notifications/crew sends and logs a NOTIFICATION comm', async () => {
    const response = await request(app.getHttpServer()).post('/legs/leg-1/notifications/crew').send();

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'OUTBOUND', kind: 'NOTIFICATION' }));
  });

  it('GET /legs/:legId/notifications returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs/leg-1/notifications');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
