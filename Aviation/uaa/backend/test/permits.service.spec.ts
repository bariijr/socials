import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermitsService } from '../src/permits/permits.service';
import { Requirement } from '../src/service-cases/requirement.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('PermitsService', () => {
  let service: PermitsService;
  let requirementRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceCaseRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceOrderRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock };
  let countryRequirementRepo: { findOne: jest.Mock };
  let formTemplateRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg = {
    id: 'leg-1',
    legId: 149,
    tripNo: '482421',
    icao: 'HECA',
    tail: 'N148B',
    country: 'Egypt',
    arrDate: new Date('2026-09-16T16:20:00.000Z'),
    captName: 'ADAM HEBERT',
    captEmail: 'adam@example.com',
  };

  const countryRequirement = {
    id: 'cr-1',
    country: 'Egypt',
    leadTimeHours: 96,
    workingDaysOnly: true,
    toleranceHours: 6,
    requiredDocs: ['AOC', 'Insurance', 'Crew List'],
    submissionEmail: 'permits.eg@example.com',
  };

  const formTemplate = {
    id: 'ft-1',
    country: 'Egypt',
    name: 'Egypt Overflight/Landing Request',
    bodyTemplate: 'Requesting permit for trip #1, tail #2.',
    mergeFields: ['tripNo', 'tail'],
  };

  beforeEach(async () => {
    requirementRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'req-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    serviceCaseRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'sc-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    serviceOrderRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'so-1', ...entity })),
      findOne: jest.fn(),
    };
    commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };
    legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    countryRequirementRepo = { findOne: jest.fn().mockResolvedValue(countryRequirement) };
    formTemplateRepo = { findOne: jest.fn().mockResolvedValue(formTemplate) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermitsService,
        { provide: getRepositoryToken(Requirement), useValue: requirementRepo },
        { provide: getRepositoryToken(ServiceCase), useValue: serviceCaseRepo },
        { provide: getRepositoryToken(ServiceOrder), useValue: serviceOrderRepo },
        { provide: getRepositoryToken(Comm), useValue: commRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: getRepositoryToken(CountryRequirement), useValue: countryRequirementRepo },
        { provide: getRepositoryToken(FormTemplate), useValue: formTemplateRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(PermitsService);
  });

  it('computes requiredByZ from the country requirement and the leg arrival date', async () => {
    await service.create('leg-1', 'Egypt');

    expect(requirementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT' }),
    );
    const createdArg = requirementRepo.create.mock.calls[0][0];
    expect(createdArg.requiredByZ).toBeInstanceOf(Date);
    expect(serviceCaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ requirementId: 'req-1', status: 'REQUESTED' }),
    );
  });

  it('renders the country template with leg fields and sends it', async () => {
    await service.create('leg-1', 'Egypt');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'permits.eg@example.com',
        body: expect.stringContaining('Requesting permit for trip 482421, tail N148B.'),
      }),
    );
  });

  it('embeds a [LegID/ServiceCaseID] correlation token in the subject', async () => {
    await service.create('leg-1', 'Egypt');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/\[149\/sc-1\]/) }),
    );
  });

  it('records an outbound Comm row for the sent request', async () => {
    await service.create('leg-1', 'Egypt');

    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUTBOUND', kind: 'REQUEST', toAddress: 'permits.eg@example.com', serviceCaseId: 'sc-1' }),
    );
    expect(commRepo.save).toHaveBeenCalled();
  });

  it('throws NotFoundException when the leg does not exist', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.create('missing-leg', 'Egypt')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when there is no CountryRequirement for the country', async () => {
    countryRequirementRepo.findOne.mockResolvedValue(null);

    await expect(service.create('leg-1', 'Nowhereland')).rejects.toThrow(NotFoundException);
  });

  it('lists permit requests for a leg', async () => {
    requirementRepo.find.mockResolvedValue([
      { id: 'req-1', legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null },
    ]);
    serviceCaseRepo.findOne.mockResolvedValue({
      id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    serviceOrderRepo.findOne.mockResolvedValue({
      id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: 'permits.eg@example.com', correlationToken: '149/sc-1',
    });

    const result = await service.findByLeg('leg-1');

    expect(requirementRepo.find).toHaveBeenCalledWith({ where: { legId: 'leg-1' } });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'sc-1', legId: 'leg-1', country: 'Egypt' }));
  });

  it('updates status and confirmation fields', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
    requirementRepo.findOne.mockResolvedValue({
      id: 'req-1', legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null,
    });
    serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
    serviceCaseRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.update('sc-1', { status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('updates responsibility on the linked requirement', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED' });
    requirementRepo.findOne.mockResolvedValue({
      id: 'req-1', legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null,
    });
    serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
    serviceCaseRepo.save.mockImplementation(async (entity) => entity);
    requirementRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.update('sc-1', { responsibility: 'CLIENT_ARRANGEMENT' });

    expect(requirementRepo.save).toHaveBeenCalledWith(expect.objectContaining({ responsibility: 'CLIENT_ARRANGEMENT' }));
    expect(result).toEqual(expect.objectContaining({ responsibility: 'CLIENT_ARRANGEMENT' }));
  });

  it('throws NotFoundException when updating a permit request that does not exist', async () => {
    serviceCaseRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { status: 'CONFIRMED' })).rejects.toThrow(NotFoundException);
  });

  it('reconcileForLeg flips a CONFIRMED request whose validity window no longer covers the leg ETD', async () => {
    requirementRepo.find.mockResolvedValue([{ id: 'req-1', legId: 'leg-1', requiredByZ: null }]);
    serviceCaseRepo.findOne.mockResolvedValue({
      id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
      validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
    });

    await service.reconcileForLeg('leg-1', new Date('2026-09-25T00:00:00.000Z'));

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }),
    );
  });

  it('reconcileForLeg does not save a request whose status does not change', async () => {
    requirementRepo.find.mockResolvedValue([{ id: 'req-1', legId: 'leg-1', requiredByZ: null }]);
    serviceCaseRepo.findOne.mockResolvedValue({
      id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
      validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
    });
    serviceCaseRepo.save.mockClear();

    await service.reconcileForLeg('leg-1', new Date('2026-09-15T00:00:00.000Z'));

    expect(serviceCaseRepo.save).not.toHaveBeenCalled();
  });

  it('findAllWithUrgency joins each request to its leg summary and computed urgency', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    requirementRepo.findOne.mockResolvedValue({
      id: 'req-1', legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT', requiredByZ: new Date(Date.now() - 3_600_000),
    });
    serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', tripNo: '482421', icao: 'HECA', tail: 'N148B' });

    const result = await service.findAllWithUrgency();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'sc-1',
        urgency: 'BREACH',
        legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' },
      }),
    ]);
  });

  it('findAllWithUrgency reports OK urgency for a request with no requiredByZ set', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'NOT_STARTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    requirementRepo.findOne.mockResolvedValue({
      id: 'req-1', legId: 'leg-1', country: 'Egypt', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null,
    });
    serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', tripNo: '482421', icao: 'HECA', tail: 'N148B' });

    const result = await service.findAllWithUrgency();

    expect(result[0].urgency).toBe('OK');
  });

  it('addManualComm files an inbound reply against a service case', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1' });
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', legId: 'leg-1' });
    serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });

    const result = await service.addManualComm('sc-1', {
      fromAddress: 'permits.eg@example.com',
      subject: 'RE: Permit Request',
      body: 'Clearance confirmed, number EG-4471.',
    });

    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'INBOUND',
        legId: 'leg-1',
        serviceCaseId: 'sc-1',
        kind: 'REQUEST',
        fromAddress: 'permits.eg@example.com',
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'comm-1' }));
  });

  it('addManualComm throws NotFoundException for an unknown service case', async () => {
    serviceCaseRepo.findOne.mockResolvedValue(null);

    await expect(
      service.addManualComm('missing', { fromAddress: 'x@example.com', subject: 's', body: 'b' }),
    ).rejects.toThrow(NotFoundException);
  });
});
