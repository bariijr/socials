import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LegsService } from '../src/legs/legs.service';
import { Leg } from '../src/legs/leg.entity';

describe('LegsService', () => {
  let service: LegsService;
  let legRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; maximum: jest.Mock };

  beforeEach(async () => {
    legRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      maximum: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LegsService, { provide: getRepositoryToken(Leg), useValue: legRepo }],
    }).compile();
    service = moduleRef.get(LegsService);
  });

  it('assigns the next leg ID as max(existing legId) + 1', async () => {
    legRepo.maximum.mockResolvedValue(41);

    const result = await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.maximum).toHaveBeenCalledWith('legId');
    expect(legRepo.create).toHaveBeenCalledWith(expect.objectContaining({ legId: 42, tripNo: '2608001', icao: 'GMMN' }));
    expect(result).toEqual(expect.objectContaining({ id: 'generated-id', legId: 42 }));
  });

  it('assigns leg ID 1 when no legs exist yet', async () => {
    legRepo.maximum.mockResolvedValue(null);

    await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.create).toHaveBeenCalledWith(expect.objectContaining({ legId: 1 }));
  });

  it('lists all legs', async () => {
    legRepo.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('finds one leg by id', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '2608001' });

    const result = await service.findOne('1');

    expect(result).toEqual(expect.objectContaining({ tripNo: '2608001' }));
  });
});
