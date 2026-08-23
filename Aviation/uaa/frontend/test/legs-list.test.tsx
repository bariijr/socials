import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders formatted arrival and departure date/time columns', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      {
        id: '1',
        tripNo: '2608001',
        icao: 'GMMN',
        tail: 'N832PJ',
        country: 'Morocco',
        arrDate: '2026-08-21T01:05:00.000Z',
        depDate: '2026-08-21T02:10:00.000Z',
        legId: 1,
      },
    ]);

    render(<LegsPage />);
    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());

    const row = screen.getByText('2608001').closest('tr')!;
    expect(within(row).getAllByText(/2026/).length).toBe(2);
  });

  it('sorts ascending by Trip No by default, then reverses on header click', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608002', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 2 },
      { id: '2', tripNo: '2608001', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 1 },
    ]);

    render(<LegsPage />);
    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());

    let rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2608001');
    expect(rows[2]).toHaveTextContent('2608002');

    const user = userEvent.setup();
    await user.click(screen.getByRole('columnheader', { name: /Trip No/ }));

    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2608002');
    expect(rows[2]).toHaveTextContent('2608001');
  });

  it('filters rows by the search box', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608001', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 1 },
      { id: '2', tripNo: '482421', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 2 },
    ]);

    render(<LegsPage />);
    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Search/), 'HECA');

    expect(screen.queryByText('2608001')).not.toBeInTheDocument();
    expect(screen.getByText('482421')).toBeInTheDocument();
  });

  it('filters rows by the country dropdown', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608001', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 1 },
      { id: '2', tripNo: '482421', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 2 },
    ]);

    render(<LegsPage />);
    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filter by country'), 'Egypt');

    expect(screen.queryByText('2608001')).not.toBeInTheDocument();
    expect(screen.getByText('482421')).toBeInTheDocument();
  });

  it('shows a Completed badge for legs with completedAt set', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      {
        id: '1',
        tripNo: '2608001',
        icao: 'GMMN',
        tail: 'N832PJ',
        country: 'Morocco',
        arrDate: null,
        depDate: null,
        legId: 1,
        completedAt: '2026-08-23T00:00:00.000Z',
      },
    ]);

    render(<LegsPage />);

    await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument());
  });
});
