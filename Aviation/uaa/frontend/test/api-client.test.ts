import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getLegs, createLeg, getLeg } from '../src/lib/api-client';

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
});
