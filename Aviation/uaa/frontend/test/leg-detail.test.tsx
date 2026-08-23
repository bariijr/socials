import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import LegDetailPage from '../src/app/legs/[id]/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getLeg: vi.fn(), getLegs: vi.fn(), markLegComplete: vi.fn() };
});

const mockRouter = { push: vi.fn(), replace: vi.fn() };

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useRouter: () => mockRouter,
  };
});

describe('LegDetailPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders the leg trip no, ICAO, and tail', async () => {
    vi.mocked(apiClient.getLeg).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
    });
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);

    render(<LegDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /482421/ })).toBeInTheDocument());
    expect(screen.getByText('HECA')).toBeInTheDocument();
    expect(screen.getByText('N148B')).toBeInTheDocument();
  });

  it('marks the leg complete and shows the Completed badge', async () => {
    vi.mocked(apiClient.getLeg).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
      completedAt: null,
    });
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);
    vi.mocked(apiClient.markLegComplete).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
      completedAt: '2026-08-23T00:00:00.000Z',
    });

    render(<LegDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /482421/ })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));

    await waitFor(() => expect(screen.getByText(/Completed/)).toBeInTheDocument());
  });
});
