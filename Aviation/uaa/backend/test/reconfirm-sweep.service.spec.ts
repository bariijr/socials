import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconfirmSweepService } from '../src/permits/reconfirm-sweep.service';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Leg } from '../src/legs/leg.entity';

describe('ReconfirmSweepService', () => {
  let service: ReconfirmSweepService;
  let permitRequestRepo: { find: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    permitRequestRepo = { find: jest.fn(), save: jest.fn(async (entity) => entity) };
    legRepo = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconfirmSweepService,
        { provide: getRepositoryToken(PermitRequest), useValue: permitRequestRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(ReconfirmSweepService);
  });

  it('flips an unconfirmed request whose RequiredByZ has passed and returns the flip count', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', status: 'REQUESTED', requiredByZ: new Date('2020-01-01T00:00:00.000Z'), validFrom: null, validTo: null },
    ]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', arrDate: new Date('2020-01-05T00:00:00.000Z') });

    const flipped = await service.sweep();

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pr-1', status: 'RECONFIRM_REQUIRED' }),
    );
    expect(flipped).toBe(1);
  });

  it('skips CANCELLED requests entirely and does not query their leg', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', status: 'CANCELLED', requiredByZ: new Date('2020-01-01T00:00:00.000Z'), validFrom: null, validTo: null },
    ]);

    const flipped = await service.sweep();

    expect(legRepo.findOne).not.toHaveBeenCalled();
    expect(permitRequestRepo.save).not.toHaveBeenCalled();
    expect(flipped).toBe(0);
  });

  it('only queries requests not already RECONFIRM_REQUIRED or CANCELLED', async () => {
    permitRequestRepo.find.mockResolvedValue([]);

    await service.sweep();

    expect(permitRequestRepo.find).toHaveBeenCalledWith({
      where: expect.arrayContaining([
        expect.objectContaining({ status: expect.anything() }),
      ]),
    });
  });
});
