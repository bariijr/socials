import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import PermitRequests from '../src/app/legs/[id]/permit-requests';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return {
    ...actual,
    listPermitRequests: vi.fn(),
    createPermitRequest: vi.fn(),
    updatePermitRequest: vi.fn(),
    checkCompatiblePermitRequest: vi.fn(),
    mergePermitRequest: vi.fn(),
  };
});

describe('PermitRequests', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.listPermitRequests).mockReset().mockResolvedValue([]);
    vi.mocked(apiClient.createPermitRequest).mockReset();
    vi.mocked(apiClient.updatePermitRequest).mockReset();
    vi.mocked(apiClient.checkCompatiblePermitRequest).mockReset().mockResolvedValue(null);
    vi.mocked(apiClient.mergePermitRequest).mockReset();
  });

  it('lists existing permit requests with their status', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT' },
    ]);

    render(<PermitRequests legId="1" country="Egypt" />);

    await waitFor(() => expect(screen.getByText('Egypt')).toBeInTheDocument());
    expect(screen.getByText('REQUESTED')).toBeInTheDocument();
  });

  it("requests a permit for the leg's country and refreshes the list", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createPermitRequest).mockResolvedValue({
      id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT',
    });

    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));

    await waitFor(() => expect(apiClient.createPermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt', 'OVERFLIGHT'));
    expect(apiClient.listPermitRequests).toHaveBeenCalledTimes(2); // initial load + refresh after create
  });

  it('marks a permit confirmed with a clearance number', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT' },
    ]);
    vi.mocked(apiClient.updatePermitRequest).mockResolvedValue({
      id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'CONFIRMED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: 'EG-4471', responsibility: 'OUR_ARRANGEMENT',
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

  it('changes responsibility for a permit request', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT' },
    ]);
    vi.mocked(apiClient.updatePermitRequest).mockResolvedValue({
      id: 'pr-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'CLIENT_ARRANGEMENT',
    });

    render(<PermitRequests legId="1" country="Egypt" />);
    await waitFor(() => expect(screen.getByText('Egypt')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Responsibility/), 'CLIENT_ARRANGEMENT');

    await waitFor(() =>
      expect(apiClient.updatePermitRequest).toHaveBeenCalledWith('test-token', 'pr-1', { responsibility: 'CLIENT_ARRANGEMENT' }),
    );
  });

  it('shows a merge-confirmation choice when a compatible request already exists, and merges on confirm', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([]);
    vi.mocked(apiClient.checkCompatiblePermitRequest).mockResolvedValue({
      requirementId: 'req-1', legIds: ['2'], status: 'REQUESTED', correlationToken: '150/sc-1',
    });
    vi.mocked(apiClient.mergePermitRequest).mockResolvedValue({
      id: 'sc-1', legIds: ['2', '1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED',
      requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT',
    });

    const user = userEvent.setup();
    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));
    await waitFor(() => expect(apiClient.checkCompatiblePermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt', 'OVERFLIGHT'));

    await user.click(await screen.findByRole('button', { name: /merge into it/i }));

    await waitFor(() => expect(apiClient.mergePermitRequest).toHaveBeenCalledWith('test-token', '1', 'req-1'));
  });

  it('creates a separate request when no compatible request exists', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([]);
    vi.mocked(apiClient.checkCompatiblePermitRequest).mockResolvedValue(null);
    vi.mocked(apiClient.createPermitRequest).mockResolvedValue({
      id: 'sc-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED',
      requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT',
    });

    const user = userEvent.setup();
    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));

    await waitFor(() => expect(apiClient.createPermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt', 'OVERFLIGHT'));
  });
});
