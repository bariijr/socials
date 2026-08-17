import { describe, it, expect } from 'vitest';
import { filterTrips } from './trips-filter.js';

const sample = [
  { id: '1', tripCode: '2608001', clientOperator: 'Acacia', registration: '5HAAA', status: 'DRAFT' },
  { id: '2', tripCode: '2608002', clientOperator: 'Kilimanjaro Air', registration: '5HBBB', status: 'CONFIRMED' },
];

describe('filterTrips', () => {
  it('matches by trip code, client, or registration, case-insensitively', () => {
    expect(filterTrips(sample, 'acacia', 'ALL').map((t) => t.id)).toEqual(['1']);
    expect(filterTrips(sample, '5HBBB', 'ALL').map((t) => t.id)).toEqual(['2']);
  });
  it('filters by status', () => {
    expect(filterTrips(sample, '', 'CONFIRMED').map((t) => t.id)).toEqual(['2']);
  });
  it('returns everything for an empty query and ALL status', () => {
    expect(filterTrips(sample, '', 'ALL')).toHaveLength(2);
  });
});
