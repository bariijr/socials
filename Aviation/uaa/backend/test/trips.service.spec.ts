import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TripsService } from '../src/trips/trips.service';
import { Trip } from '../src/trips/trip.entity';
import { Leg } from '../src/legs/leg.entity';

describe('TripsService', () => {
  let service: TripsService;
  let tripRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let legRepo: { find: jest.Mock };

  beforeEach(async () => {
    tripRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'trip-1', ...entity })),
    };
    legRepo = { find: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: tripRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(TripsService);
  });

  describe('findOrCreateByTripNo', () => {
    it('returns the existing trip when one already exists for the tripNo', async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '482421' });

      const result = await service.findOrCreateByTripNo('482421');

      expect(result).toEqual({ id: 'trip-1', tripNo: '482421' });
      expect(tripRepo.create).not.toHaveBeenCalled();
    });

    it('creates a new trip when none exists for the tripNo', async () => {
      tripRepo.findOne.mockResolvedValue(null);

      const result = await service.findOrCreateByTripNo('999999');

      expect(tripRepo.create).toHaveBeenCalledWith({ tripNo: '999999' });
      expect(result).toEqual(expect.objectContaining({ id: 'trip-1', tripNo: '999999' }));
    });
  });

  describe('getWorkspace', () => {
    it('throws NotFoundException when no trip has that tripNo', async () => {
      tripRepo.findOne.mockResolvedValue(null);

      await expect(service.getWorkspace('missing')).rejects.toThrow(NotFoundException);
    });

    it("aggregates tails, operators, countries, and status across the trip's legs", async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '484701' });
      legRepo.find.mockResolvedValue([
        {
          id: 'leg-1', legId: 1, tail: 'N221RW', operatorName: 'ACME', country: 'Nigeria',
          depDate: new Date('2026-09-14T00:18:00.000Z'), arrDate: new Date('2026-09-14T12:18:00.000Z'),
          completedAt: null,
        },
        {
          id: 'leg-2', legId: 2, tail: 'N221RW', operatorName: 'ACME', country: 'South Africa',
          depDate: new Date('2026-09-18T18:00:00.000Z'), arrDate: new Date('2026-09-16T21:30:00.000Z'),
          completedAt: null,
        },
      ]);

      const result = await service.getWorkspace('484701');

      expect(result.tails).toEqual(['N221RW']);
      expect(result.operatorNames).toEqual(['ACME']);
      expect(result.countries).toEqual(['Nigeria', 'South Africa']);
      expect(result.legCount).toBe(2);
      expect(result.status).toBe('ACTIVE');
      expect(result.legs).toHaveLength(2);
    });

    it('reports COMPLETED status only when every leg is complete', async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '482421' });
      legRepo.find.mockResolvedValue([
        { id: 'leg-1', legId: 1, tail: 'N148B', operatorName: null, country: 'Egypt', depDate: null, arrDate: null, completedAt: new Date() },
        { id: 'leg-2', legId: 2, tail: 'N148B', operatorName: null, country: 'Morocco', depDate: null, arrDate: null, completedAt: new Date() },
      ]);

      const result = await service.getWorkspace('482421');

      expect(result.status).toBe('COMPLETED');
    });
  });
});
