import { parseCorrelationToken } from '../src/mail/correlation-token';

describe('parseCorrelationToken', () => {
  it('extracts legId and permitRequestId from a subject carrying the token', () => {
    const subject = 'RE: Permit Request — Trip 482421 — Egypt [149/5c8f18b2-9f30-4438-a51e-aac332077443]';

    expect(parseCorrelationToken(subject)).toEqual({
      legId: 149,
      permitRequestId: '5c8f18b2-9f30-4438-a51e-aac332077443',
    });
  });

  it('returns null when the subject carries no token', () => {
    expect(parseCorrelationToken('Re: hello')).toBeNull();
  });

  it('returns null when the bracketed content is not a well-formed token', () => {
    expect(parseCorrelationToken('Re: something [not-a-token]')).toBeNull();
  });
});
