import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import LegsPage from '../src/app/legs/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getLegs: vi.fn() };
});

describe('LegsPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders each leg row with trip no, ICAO, and tail', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608001', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 1 },
    ]);

    render(<LegsPage />);

    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());
    expect(screen.getByText('GMMN')).toBeInTheDocument();
    expect(screen.getByText('N832PJ')).toBeInTheDocument();
  });
});
