import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import TripWorkspacePage from '../src/app/trips/[tripNo]/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getTrip: vi.fn() };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useParams: () => ({ tripNo: '484701' }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  };
});

describe('TripWorkspacePage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it("renders the trip's aggregate info and its legs", async () => {
    vi.mocked(apiClient.getTrip).mockResolvedValue({
      tripNo: '484701',
      tails: ['N221RW'],
      operatorNames: ['ACME'],
      countries: ['Nigeria', 'South Africa'],
      legCount: 2,
      firstDeparture: '2026-09-14T00:18:00.000Z',
      lastArrival: '2026-09-18T06:10:00.000Z',
      status: 'ACTIVE',
      legs: [
        { id: 'leg-1', tripNo: '484701', icao: 'DNAA', tail: 'N221RW', country: 'Nigeria', arrDate: null, depDate: null, legId: 51 },
        { id: 'leg-2', tripNo: '484701', icao: 'FACT', tail: 'N221RW', country: 'South Africa', arrDate: null, depDate: null, legId: 54 },
      ],
    });

    render(<TripWorkspacePage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /484701/ })).toBeInTheDocument());
    expect(screen.getAllByText('N221RW').length).toBeGreaterThan(0);
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('DNAA')).toBeInTheDocument();
    expect(screen.getByText('FACT')).toBeInTheDocument();
  });
});
