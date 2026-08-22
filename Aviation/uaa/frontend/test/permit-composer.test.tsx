import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import PermitRequests from '../src/app/legs/[id]/permit-requests';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, listPermitRequests: vi.fn(), createPermitRequest: vi.fn(), updatePermitRequest: vi.fn() };
});

describe('PermitRequests', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.listPermitRequests).mockReset().mockResolvedValue([]);
    vi.mocked(apiClient.createPermitRequest).mockReset();
    vi.mocked(apiClient.updatePermitRequest).mockReset();
  });

  it('lists existing permit requests with their status', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null },
    ]);

    render(<PermitRequests legId="1" country="Egypt" />);

    await waitFor(() => expect(screen.getByText('Egypt')).toBeInTheDocument());
    expect(screen.getByText('REQUESTED')).toBeInTheDocument();
  });

  it("requests a permit for the leg's country and refreshes the list", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createPermitRequest).mockResolvedValue({
      id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null,
    });

    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));

    await waitFor(() => expect(apiClient.createPermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt'));
    expect(apiClient.listPermitRequests).toHaveBeenCalledTimes(2); // initial load + refresh after create
  });

  it('marks a permit confirmed with a clearance number', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null },
    ]);
    vi.mocked(apiClient.updatePermitRequest).mockResolvedValue({
      id: 'pr-1', legId: '1', country: 'Egypt', status: 'CONFIRMED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: 'EG-4471',
    });

    render(<PermitRequests legId="1" country="Egypt" />);

    await user.type(await screen.findByLabelText(/clearance number/i), 'EG-4471');
    await user.click(screen.getByRole('button', { name: /mark confirmed/i }));

    await waitFor(() =>
      expect(apiClient.updatePermitRequest).toHaveBeenCalledWith('test-token', 'pr-1', {
        status: 'CONFIRMED',
        clearanceNumber: 'EG-4471',
      }),
    );
  });
});
