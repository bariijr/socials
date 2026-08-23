import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermitsService } from '../src/permits/permits.service';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('PermitsService', () => {
  let service: PermitsService;
  let permitRequestRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
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
    permitRequestRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pr-1', ...entity })),
      find: jest.fn(),
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
        { provide: getRepositoryToken(PermitRequest), useValue: permitRequestRepo },
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

    expect(permitRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ legId: 'leg-1', country: 'Egypt', status: 'REQUESTED' }),
    );
    const createdArg = permitRequestRepo.create.mock.calls[0][0];
    expect(createdArg.requiredByZ).toBeInstanceOf(Date);
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

  it('embeds a [LegID/PR-ID] correlation token in the subject', async () => {
    await service.create('leg-1', 'Egypt');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/\[149\/pr-1\]/) }),
    );
  });

  it('records an outbound Comm row for the sent request', async () => {
    await service.create('leg-1', 'Egypt');

    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUTBOUND', kind: 'REQUEST', toAddress: 'permits.eg@example.com' }),
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
    permitRequestRepo.find.mockResolvedValue([{ id: 'pr-1' }, { id: 'pr-2' }]);

    const result = await service.findByLeg('leg-1');

    expect(permitRequestRepo.find).toHaveBeenCalledWith({ where: { legId: 'leg-1' } });
    expect(result).toHaveLength(2);
  });

  it('updates status and confirmation fields', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', status: 'REQUESTED' });

    const result = await service.update('pr-1', { status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('throws NotFoundException when updating a permit request that does not exist', async () => {
    permitRequestRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { status: 'CONFIRMED' })).rejects.toThrow(NotFoundException);
  });

  it('reconcileForLeg flips a CONFIRMED request whose validity window no longer covers the leg ETD', async () => {
    permitRequestRepo.find.mockResolvedValue([
      {
        id: 'pr-1',
        legId: 'leg-1',
        status: 'CONFIRMED',
        requiredByZ: null,
        validFrom: new Date('2026-09-10T00:00:00.000Z'),
        validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);

    await service.reconcileForLeg('leg-1', new Date('2026-09-25T00:00:00.000Z'));

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pr-1', status: 'RECONFIRM_REQUIRED' }),
    );
  });

  it('reconcileForLeg does not save a request whose status does not change', async () => {
    permitRequestRepo.find.mockResolvedValue([
      {
        id: 'pr-1',
        legId: 'leg-1',
        status: 'CONFIRMED',
        requiredByZ: null,
        validFrom: new Date('2026-09-10T00:00:00.000Z'),
        validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    permitRequestRepo.save.mockClear();

    await service.reconcileForLeg('leg-1', new Date('2026-09-15T00:00:00.000Z'));

    expect(permitRequestRepo.save).not.toHaveBeenCalled();
  });
});
