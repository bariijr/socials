import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  login,
  getLegs,
  createLeg,
  getLeg,
  listPermitRequests,
  createPermitRequest,
  updatePermitRequest,
  listAllPermitRequests,
  listNotifications,
  sendCrewNotification,
  sendTeamNotification,
  sendAgentServiceReport,
  getAgentWhatsAppLink,
} from '../src/lib/api-client';

describe('api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('login posts credentials and returns the access token', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'token-123' }) });

    const result = await login('bminja', 'secret');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'bminja', password: 'secret' }),
      }),
    );
    expect(result).toEqual({ accessToken: 'token-123' });
  });

  it('login throws when the response is not ok', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });

    await expect(login('bminja', 'wrong')).rejects.toThrow('Login failed');
  });

  it('getLegs sends the bearer token and returns the parsed array', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ id: '1', tripNo: '2608001' }] });

    const result = await getLegs('token-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual([{ id: '1', tripNo: '2608001' }]);
  });

  it('createLeg posts the bearer token and leg fields, returning the created leg', async () => {
    const created = { id: '1', tripNo: '2608001', icao: 'GMMN', legId: 63 };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => created });

    const result = await createLeg('token-123', { tripNo: '2608001', icao: 'GMMN' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
        body: JSON.stringify({ tripNo: '2608001', icao: 'GMMN' }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('createLeg throws when the response is not ok', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 400 });

    await expect(createLeg('token-123', { tripNo: '2608001', icao: 'GMMN' })).rejects.toThrow(
      'Failed to create leg',
    );
  });

  it('getLeg fetches a single leg by id with the bearer token', async () => {
    const leg = { id: '1', tripNo: '482421', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 149 };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => leg });

    const result = await getLeg('token-123', '1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(leg);
  });

  it('listPermitRequests fetches permit requests for a leg', async () => {
    const requests = [{ id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED' }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => requests });

    const result = await listPermitRequests('token-123', '1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1/permit-requests'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(requests);
  });

  it('createPermitRequest posts the country and returns the created request', async () => {
    const created = { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED' };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => created });

    const result = await createPermitRequest('token-123', '1', 'Egypt');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1/permit-requests'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
        body: JSON.stringify({ country: 'Egypt' }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('updatePermitRequest patches status and confirmation fields', async () => {
    const updated = { id: 'pr-1', status: 'CONFIRMED' };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => updated });

    const result = await updatePermitRequest('token-123', 'pr-1', { status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/permit-requests/pr-1'),
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
        body: JSON.stringify({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' }),
      }),
    );
    expect(result).toEqual(updated);
  });

  it('listAllPermitRequests fetches every permit request with urgency', async () => {
    const requests = [{ id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', urgency: 'BREACH', legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' } }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => requests });

    const result = await listAllPermitRequests('token-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/permit-requests'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(requests);
  });

  it('listNotifications fetches NOTIFICATION comms for a leg', async () => {
    const comms = [{ id: 'comm-1', legId: 'leg-1', direction: 'OUTBOUND', toAddress: 'adam@example.com', subject: 'UA Crew Notification', sentAt: '2026-08-23T00:00:00.000Z' }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => comms });

    const result = await listNotifications('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(comms);
  });

  it('sendCrewNotification posts to the crew notification endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendCrewNotification('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/crew'),
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer token-123' } }),
    );
  });

  it('sendTeamNotification posts to the team notification endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendTeamNotification('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/team'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sendAgentServiceReport posts to the agent-service-report endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendAgentServiceReport('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/agent-service-report'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getAgentWhatsAppLink posts to the agent-whatsapp endpoint and returns the url/phone', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ url: 'https://wa.me/212661888747?text=Hi', phone: '+212 661 888 747' }) });

    const result = await getAgentWhatsAppLink('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/agent-whatsapp'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ url: 'https://wa.me/212661888747?text=Hi', phone: '+212 661 888 747' });
  });
});
