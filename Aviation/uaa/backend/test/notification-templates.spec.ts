import {
  formatZ,
  firstName,
  buildSignature,
  buildCrewNotificationEmail,
  buildTeamNotificationEmail,
  buildAgentServiceReportEmail,
  buildAgentWhatsAppMessage,
  buildWhatsAppLink,
} from '../src/notifications/notification-templates';

describe('formatZ', () => {
  it('formats a UTC date as DD-MMM-YYYY HH:MMZ', () => {
    expect(formatZ(new Date('2026-09-16T16:20:00.000Z'))).toBe('16-Sep-2026 16:20Z');
  });

  it('returns TBD for null', () => {
    expect(formatZ(null)).toBe('TBD');
  });
});

describe('firstName', () => {
  it('extracts and title-cases the first word', () => {
    expect(firstName('ADAM HEBERT')).toBe('Adam');
  });

  it('returns empty string for null or blank', () => {
    expect(firstName(null)).toBe('');
    expect(firstName('  ')).toBe('');
  });
});

describe('buildSignature', () => {
  it('includes the coordinator name, title, and mobile', () => {
    const sig = buildSignature({ fullName: 'Barnaba Minja', jobTitle: 'A2G Coordinator', mobile: '+255 713 000 000' });
    expect(sig).toContain('Barnaba Minja');
    expect(sig).toContain('A2G Coordinator');
    expect(sig).toContain('+255 713 000 000');
    expect(sig).toContain('Universal Weather & Aviation, Inc.');
  });
});

const leg = {
  tail: 'N148B',
  tripNo: '482421',
  icao: 'HECA',
  country: 'Egypt',
  arrDate: new Date('2026-09-16T16:20:00.000Z'),
  depDate: new Date('2026-09-17T15:00:00.000Z'),
  captName: 'ADAM HEBERT',
  agentName: 'Hicham Bentouzer',
};

const user = {
  fullName: 'Barnaba Minja',
  jobTitle: 'A2G Coordinator',
  mobile: '+255 713 000 000',
  fromEmail: 'bminja@univ-wea.com',
};

describe('buildCrewNotificationEmail', () => {
  it('greets the captain by first name and includes agent contact details', () => {
    const { subject, body } = buildCrewNotificationEmail(leg, user, 'starscmn@starsaviationservices.com', '+212 661 888 747');

    expect(subject).toContain('HECA');
    expect(subject).toContain('N148B');
    expect(body).toContain('Greetings Captain Adam');
    expect(body).toContain('Hicham Bentouzer');
    expect(body).toContain('starscmn@starsaviationservices.com');
    expect(body).toContain('+212 661 888 747');
    expect(body).toContain('16-Sep-2026 16:20Z');
  });
});

describe('buildTeamNotificationEmail', () => {
  it('greets the named team and includes agent contact details', () => {
    const { subject, body } = buildTeamNotificationEmail(
      leg,
      { name: 'X-RAY' },
      user,
      'starscmn@starsaviationservices.com',
      '+212 661 888 747',
    );

    expect(subject).toContain('HECA');
    expect(body).toContain('Greetings X-RAY Team');
    expect(body).toContain('Hicham Bentouzer');
    expect(body).toContain('starscmn@starsaviationservices.com');
  });
});

describe('buildAgentServiceReportEmail', () => {
  it("greets the agent by first name and asks for the report at the coordinator's email", () => {
    const { subject, body } = buildAgentServiceReportEmail(leg, user);

    expect(subject).toBe('UAA Service Report for HECA - Ref: N148B-482421');
    expect(body).toContain('Greetings Hicham');
    expect(body).toContain('bminja@univ-wea.com');
  });
});

describe('buildAgentWhatsAppMessage', () => {
  it('mentions the tail, trip, and ICAO', () => {
    const msg = buildAgentWhatsAppMessage(leg, user);
    expect(msg).toContain('N148B');
    expect(msg).toContain('482421');
    expect(msg).toContain('HECA');
    expect(msg).toContain('Barnaba Minja');
  });
});

describe('buildWhatsAppLink', () => {
  it('strips non-digits and URL-encodes the message', () => {
    const url = buildWhatsAppLink('+212 661 888 747', 'Hi there');
    expect(url).toBe('https://wa.me/212661888747?text=Hi%20there');
  });

  it('returns null for an empty phone number', () => {
    expect(buildWhatsAppLink('', 'Hi there')).toBeNull();
  });
});
