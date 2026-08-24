import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermitsService } from '../src/permits/permits.service';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
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
  let requirementLegRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let serviceCaseRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceOrderRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock; find: jest.Mock };
  let countryRequirementRepo: { findOne: jest.Mock };
  let formTemplateRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg1 = {
    id: 'leg-1', legId: 149, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
    country: 'Egypt', arrDate: new Date('2026-09-16T16:20:00.000Z'),
    captName: 'ADAM HEBERT', captEmail: 'adam@example.com',
  };
  const leg2 = {
    id: 'leg-2', legId: 150, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
    country: 'Egypt', arrDate: new Date('2026-09-18T10:00:00.000Z'),
    captName: 'ADAM HEBERT', captEmail: 'adam@example.com',
  };

  const countryRequirement = {
    id: 'cr-1', country: 'Egypt', serviceType: 'OVERFLIGHT', leadTimeHours: 96, workingDaysOnly: true,
    toleranceHours: 6, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.eg@example.com',
  };
  const formTemplate = {
    id: 'ft-1', country: 'Egypt', serviceType: 'OVERFLIGHT', name: 'Egypt Overflight Permit Request',
    bodyTemplate: 'Requesting permit for trip #1, tail #2.', mergeFields: ['tripNo', 'tail'],
  };

  beforeEach(async () => {
    requirementRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'req-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    requirementLegRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'rl-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
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
    legRepo = {
      findOne: jest.fn(async ({ where: { id } }: any) => (id === 'leg-1' ? leg1 : id === 'leg-2' ? leg2 : null)),
      find: jest.fn().mockResolvedValue([leg1, leg2]),
    };
    countryRequirementRepo = { findOne: jest.fn().mockResolvedValue(countryRequirement) };
    formTemplateRepo = { findOne: jest.fn().mockResolvedValue(formTemplate) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermitsService,
        { provide: getRepositoryToken(Requirement), useValue: requirementRepo },
        { provide: getRepositoryToken(RequirementLeg), useValue: requirementLegRepo },
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

  describe('create', () => {
    it('creates a Requirement with the given serviceType and one RequirementLeg row', async () => {
      await service.create('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(requirementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT' }),
      );
      expect(requirementLegRepo.create).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
      expect(requirementLegRepo.save).toHaveBeenCalled();
    });

    it('looks up CountryRequirement/FormTemplate by (country, serviceType)', async () => {
      await service.create('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(countryRequirementRepo.findOne).toHaveBeenCalledWith({ where: { country: 'Egypt', serviceType: 'OVERFLIGHT' } });
      expect(formTemplateRepo.findOne).toHaveBeenCalledWith({ where: { country: 'Egypt', serviceType: 'OVERFLIGHT' } });
    });

    it('throws NotFoundException when the leg does not exist', async () => {
      legRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.create('missing-leg', 'Egypt', 'OVERFLIGHT')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when there is no matching CountryRequirement', async () => {
      countryRequirementRepo.findOne.mockResolvedValue(null);
      await expect(service.create('leg-1', 'Egypt', 'LANDING')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findCompatible', () => {
    it('finds a compatible pre-confirmation Requirement on another leg of the same trip', async () => {
      requirementLegRepo.find.mockImplementation(async ({ where }: any) => {
        if (where.legId) return [{ requirementId: 'req-1', legId: 'leg-2' }];
        return [];
      });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '150/sc-1' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toEqual(
        expect.objectContaining({ requirementId: 'req-1', status: 'REQUESTED', correlationToken: '150/sc-1' }),
      );
    });

    it('returns null when no other leg of the trip has a matching country/serviceType Requirement', async () => {
      requirementLegRepo.find.mockResolvedValue([]);

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });

    it('excludes a candidate whose ServiceCase is already CONFIRMED', async () => {
      requirementLegRepo.find.mockImplementation(async ({ where }: any) => {
        if (where.legId) return [{ requirementId: 'req-1', legId: 'leg-2' }];
        return [];
      });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });

    it('excludes a candidate with a different serviceType', async () => {
      requirementLegRepo.find.mockImplementation(async ({ where }: any) => {
        if (where.legId) return [{ requirementId: 'req-1', legId: 'leg-2' }];
        return [];
      });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'LANDING' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });
  });

  describe('merge', () => {
    it('adds the leg to the existing Requirement and returns the updated flat shape', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      requirementLegRepo.find
        .mockResolvedValueOnce([{ legId: 'leg-2' }])
        .mockResolvedValue([{ legId: 'leg-2' }, { legId: 'leg-1' }]);

      const result = await service.merge('leg-1', 'req-1');

      expect(requirementLegRepo.save).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
      expect(result.legIds).toEqual(['leg-2', 'leg-1']);
    });

    it('does not duplicate a RequirementLeg row if the leg is already attached', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }]);

      await service.merge('leg-1', 'req-1');

      expect(requirementLegRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target Requirement is no longer pre-confirmation', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED' });

      await expect(service.merge('leg-1', 'req-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByLeg / findAllWithUrgency', () => {
    it('lists permit requests covering a leg via RequirementLeg', async () => {
      requirementLegRepo.find.mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });

      const result = await service.findByLeg('leg-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'sc-1', country: 'Egypt', serviceType: 'OVERFLIGHT' }));
    });

    it('findAllWithUrgency reports legIds and uses the first leg for legSummary', async () => {
      serviceCaseRepo.find.mockResolvedValue([
        { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
      ]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
      requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
      legRepo.findOne.mockResolvedValueOnce(leg1);

      const result = await service.findAllWithUrgency();

      expect(result[0].legIds).toEqual(['leg-1', 'leg-2']);
      expect(result[0].legSummary).toEqual({ tripNo: '482421', icao: 'HECA', tail: 'N148B' });
    });
  });

  describe('update', () => {
    it('updates serviceType on the linked requirement', async () => {
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      serviceCaseRepo.save.mockImplementation(async (e: any) => e);
      requirementRepo.save.mockImplementation(async (e: any) => e);

      const result = await service.update('sc-1', { serviceType: 'LANDING' });

      expect(requirementRepo.save).toHaveBeenCalledWith(expect.objectContaining({ serviceType: 'LANDING' }));
      expect(result.serviceType).toBe('LANDING');
    });
  });

  describe('reconcileForLeg', () => {
    it('flips a CONFIRMED merged request when any covered leg falls outside the validity window', async () => {
      requirementLegRepo.find.mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      });

      await service.reconcileForLeg('leg-1', new Date('2026-09-25T00:00:00.000Z'));

      expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    });
  });
});
