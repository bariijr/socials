import { parseContact } from '../src/notifications/parse-contact';

describe('parseContact', () => {
  it('splits a combined "email / phone" string on the last " / "', () => {
    expect(
      parseContact('starscmn@starsaviationservices.com; starsops@starsaviationservices.com / +212 661 888 747'),
    ).toEqual({
      email: 'starscmn@starsaviationservices.com; starsops@starsaviationservices.com',
      phone: '+212 661 888 747',
    });
  });

  it('returns the whole string as email when there is no phone segment', () => {
    expect(parseContact('uaaafrica@wfscorp.com')).toEqual({ email: 'uaaafrica@wfscorp.com', phone: '' });
  });

  it('returns empty strings for null, undefined, or blank input', () => {
    expect(parseContact(null)).toEqual({ email: '', phone: '' });
    expect(parseContact(undefined)).toEqual({ email: '', phone: '' });
    expect(parseContact('   ')).toEqual({ email: '', phone: '' });
  });
});
