import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import NewLegPage from '../src/app/legs/new/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, createLeg: vi.fn(), getLegs: vi.fn() };
});

describe('NewLegPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.createLeg).mockReset();
    vi.mocked(apiClient.getLegs).mockReset().mockResolvedValue([]);
  });

  it('submits the required fields and creates a leg', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createLeg).mockResolvedValue({
      id: '1',
      tripNo: '2608001',
      icao: 'GMMN',
      tail: null,
      country: null,
      arrDate: null,
      depDate: null,
      legId: 63,
    });

    render(<NewLegPage />);

    await user.type(screen.getByLabelText(/trip no/i), '2608001');
    await user.type(screen.getByLabelText(/^icao/i), 'GMMN');
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    await waitFor(() =>
      expect(apiClient.createLeg).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ tripNo: '2608001', icao: 'GMMN' }),
      ),
    );
  });

  it('shows an error when the trip number is missing', async () => {
    const user = userEvent.setup();

    render(<NewLegPage />);

    await user.type(screen.getByLabelText(/^icao/i), 'GMMN');
    await user.click(screen.getByRole('button', { name: /save leg/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/trip no/i);
    expect(apiClient.createLeg).not.toHaveBeenCalled();
  });

  it('prefills operator, aircraft, and country fields from the most recent leg for a known tail', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      {
        id: 'a',
        tripNo: '482421',
        icao: 'OERK',
        tail: 'N148B',
        country: 'Saudi Arabia',
        arrDate: null,
        depDate: null,
        legId: 44,
        operatorName: 'OLD OPERATOR',
      },
      {
        id: 'b',
        tripNo: '482421',
        icao: 'HECA',
        tail: 'N148B',
        country: 'Egypt',
        arrDate: null,
        depDate: null,
        legId: 149,
        operatorName: 'HONEYWELL INTERNATIONAL INC',
        acType: 'F900',
        mtowLb: 49000,
      },
    ]);

    render(<NewLegPage />);

    await user.type(screen.getByLabelText(/^tail/i), 'N148B');
    await user.tab();

    await waitFor(() => expect(screen.getByLabelText(/operator name/i)).toHaveValue('HONEYWELL INTERNATIONAL INC'));
    expect(screen.getByLabelText(/^a\/c type/i)).toHaveValue('F900');
    expect(screen.getByLabelText(/country/i)).toHaveValue('Egypt');
    expect(screen.getByText(/prefilled from/i)).toBeInTheDocument();
  });

  it('does not overwrite a field the coordinator already filled in', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      {
        id: 'a',
        tripNo: '482421',
        icao: 'HECA',
        tail: 'N148B',
        country: 'Egypt',
        arrDate: null,
        depDate: null,
        legId: 44,
        operatorName: 'HONEYWELL INTERNATIONAL INC',
      },
    ]);

    render(<NewLegPage />);

    await user.type(screen.getByLabelText(/operator name/i), 'MANUALLY TYPED OPERATOR');
    await user.type(screen.getByLabelText(/^tail/i), 'N148B');
    await user.tab();

    await waitFor(() => expect(screen.getByText(/prefilled from/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/operator name/i)).toHaveValue('MANUALLY TYPED OPERATOR');
  });
});
