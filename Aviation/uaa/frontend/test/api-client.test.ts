import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getLegs } from '../src/lib/api-client';

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
});
