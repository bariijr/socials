import { evaluateReconfirm } from '../src/permits/reconfirm';

describe('evaluateReconfirm', () => {
  it('flips a CONFIRMED request to RECONFIRM_REQUIRED when the current ETD falls outside validFrom/validTo', () => {
    const request = {
      status: 'CONFIRMED' as const,
      requiredByZ: null,
      validFrom: new Date('2026-09-10T00:00:00.000Z'),
      validTo: new Date('2026-09-20T00:00:00.000Z'),
    };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('RECONFIRM_REQUIRED');
  });

  it('leaves a CONFIRMED request alone when the current ETD is still within validFrom/validTo', () => {
    const request = {
      status: 'CONFIRMED' as const,
      requiredByZ: null,
      validFrom: new Date('2026-09-10T00:00:00.000Z'),
      validTo: new Date('2026-09-20T00:00:00.000Z'),
    };

    const result = evaluateReconfirm(request, new Date('2026-09-15T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('CONFIRMED');
  });

  it('leaves a CONFIRMED request without a validFrom/validTo window alone (nothing to check against)', () => {
    const request = { status: 'CONFIRMED' as const, requiredByZ: null, validFrom: null, validTo: null };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('CONFIRMED');
  });

  it('flips an unconfirmed request to RECONFIRM_REQUIRED once RequiredByZ passes', () => {
    const request = {
      status: 'REQUESTED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-16T00:00:00.000Z'), new Date('2026-09-12T00:00:00.000Z'));

    expect(result).toBe('RECONFIRM_REQUIRED');
  });

  it('leaves an unconfirmed request alone before RequiredByZ passes', () => {
    const request = {
      status: 'REQUESTED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-16T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('REQUESTED');
  });

  it('never touches a CANCELLED request', () => {
    const request = {
      status: 'CANCELLED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-20T00:00:00.000Z'));

    expect(result).toBe('CANCELLED');
  });
});
