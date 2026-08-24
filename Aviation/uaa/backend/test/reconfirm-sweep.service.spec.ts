import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconfirmSweepService } from '../src/permits/reconfirm-sweep.service';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { Leg } from '../src/legs/leg.entity';

describe('ReconfirmSweepService', () => {
  let service: ReconfirmSweepService;
  let serviceCaseRepo: { find: jest.Mock; save: jest.Mock };
  let requirementRepo: { findOne: jest.Mock };
  let requirementLegRepo: { find: jest.Mock };
  let legRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    serviceCaseRepo = { find: jest.fn(), save: jest.fn(async (entity) => entity) };
    requirementRepo = { findOne: jest.fn() };
    requirementLegRepo = { find: jest.fn().mockResolvedValue([]) };
    legRepo = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconfirmSweepService,
        { provide: getRepositoryToken(ServiceCase), useValue: serviceCaseRepo },
        { provide: getRepositoryToken(Requirement), useValue: requirementRepo },
        { provide: getRepositoryToken(RequirementLeg), useValue: requirementLegRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(ReconfirmSweepService);
  });

  it('flips an unconfirmed request whose RequiredByZ has passed and returns the flip count', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: new Date('2020-01-01T00:00:00.000Z') });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', arrDate: new Date('2020-01-05T00:00:00.000Z') });

    const flipped = await service.sweep();

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    expect(flipped).toBe(1);
  });

  it('skips CANCELLED requests entirely and does not query their requirement or leg', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'CANCELLED', validFrom: null, validTo: null },
    ]);

    const flipped = await service.sweep();

    expect(requirementRepo.findOne).not.toHaveBeenCalled();
    expect(legRepo.findOne).not.toHaveBeenCalled();
    expect(serviceCaseRepo.save).not.toHaveBeenCalled();
    expect(flipped).toBe(0);
  });

  it('only queries service cases not already RECONFIRM_REQUIRED or CANCELLED', async () => {
    serviceCaseRepo.find.mockResolvedValue([]);

    await service.sweep();

    expect(serviceCaseRepo.find).toHaveBeenCalledWith({
      where: expect.arrayContaining([expect.objectContaining({ status: expect.anything() })]),
    });
  });

  it('flips a CONFIRMED merged request when only one of its two legs falls outside the validity window', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      {
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
    legRepo.findOne
      .mockResolvedValueOnce({ id: 'leg-1', arrDate: new Date('2026-09-12T00:00:00.000Z') }) // in window
      .mockResolvedValueOnce({ id: 'leg-2', arrDate: new Date('2026-09-25T00:00:00.000Z') }); // outside window

    const flipped = await service.sweep();

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    expect(flipped).toBe(1);
  });

  it('leaves a CONFIRMED merged request alone when every covered leg is still within the validity window', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      {
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
    legRepo.findOne
      .mockResolvedValueOnce({ id: 'leg-1', arrDate: new Date('2026-09-12T00:00:00.000Z') })
      .mockResolvedValueOnce({ id: 'leg-2', arrDate: new Date('2026-09-15T00:00:00.000Z') });
    serviceCaseRepo.save.mockClear();

    await service.sweep();

    expect(serviceCaseRepo.save).not.toHaveBeenCalled();
  });
});
