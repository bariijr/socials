import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import Notifications from '../src/app/legs/[id]/notifications';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return {
    ...actual,
    listNotifications: vi.fn(),
    sendCrewNotification: vi.fn(),
    sendTeamNotification: vi.fn(),
    sendAgentServiceReport: vi.fn(),
    getAgentWhatsAppLink: vi.fn(),
  };
});

describe('Notifications', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.listNotifications).mockResolvedValue([]);
  });

  it('sends a crew notification on click and refreshes the list', async () => {
    vi.mocked(apiClient.sendCrewNotification).mockResolvedValue({
      id: 'comm-1',
      legId: 'leg-1',
      direction: 'OUTBOUND',
      toAddress: 'adam@example.com',
      subject: 'UA Crew Notification',
      sentAt: '2026-08-23T00:00:00.000Z',
    });

    render(<Notifications legId="leg-1" />);
    await waitFor(() => expect(apiClient.listNotifications).toHaveBeenCalledWith('test-token', 'leg-1'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notify Crew' }));

    await waitFor(() => expect(apiClient.sendCrewNotification).toHaveBeenCalledWith('test-token', 'leg-1'));
  });

  it('shows an error message when a send fails', async () => {
    vi.mocked(apiClient.sendTeamNotification).mockRejectedValue(new Error('fail'));

    render(<Notifications legId="leg-1" />);
    await waitFor(() => expect(apiClient.listNotifications).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notify Team' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
