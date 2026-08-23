import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import ActionBoardPage from '../src/app/action-board/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, listAllPermitRequests: vi.fn() };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return { ...actual, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) };
});

describe('ActionBoardPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders each request with its urgency and trip summary, most severe first', async () => {
    vi.mocked(apiClient.listAllPermitRequests).mockResolvedValue([
      { id: 'pr-ok', legId: '1', country: 'Kenya', status: 'REQUESTED', urgency: 'OK', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, legSummary: { tripNo: '999999', icao: 'HKJK', tail: 'N1' } },
      { id: 'pr-breach', legId: '2', country: 'Egypt', status: 'REQUESTED', urgency: 'BREACH', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' } },
    ]);

    render(<ActionBoardPage />);

    await waitFor(() => expect(screen.getByText('BREACH')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    // header row + BREACH row before OK row
    expect(rows[1]).toHaveTextContent('482421');
    expect(rows[2]).toHaveTextContent('999999');
  });
});
