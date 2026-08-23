import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
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

  it('updates a leg and returns the saved entity', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', arrDate: new Date('2026-09-16T16:20:00.000Z') });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.update('1', { arrDate: '2026-09-18T10:00:00.000Z' });

    expect(legRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ arrDate: new Date('2026-09-18T10:00:00.000Z') }),
    );
    expect(result).toEqual(expect.objectContaining({ id: '1' }));
  });

  it('throws NotFoundException when updating a leg that does not exist', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { arrDate: '2026-09-18T10:00:00.000Z' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('markComplete stamps completedAt and returns the saved leg', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', completedAt: null });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.markComplete('1');

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(legRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: '1', completedAt: expect.any(Date) }));
  });

  it('throws NotFoundException when marking a leg that does not exist as complete', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.markComplete('missing')).rejects.toThrow(NotFoundException);
  });

  it('findCompletedInRange queries legs with completedAt between the given dates', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', completedAt: new Date('2026-08-15T00:00:00.000Z') }]);

    const result = await service.findCompletedInRange(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(legRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: expect.anything() }) }),
    );
    expect(result).toHaveLength(1);
  });

  it('exportMayflyBuffer returns a real xlsx buffer for the completed legs in range', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', country: 'Morocco', tripNo: '475087', icao: 'GMMN', legId: 63 }]);

    const buffer = await service.exportMayflyBuffer(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
