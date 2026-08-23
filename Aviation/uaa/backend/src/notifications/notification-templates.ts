import type { Leg } from '../legs/leg.entity';
import type { User } from '../users/user.entity';
import type { Team } from './team.entity';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatZ(date: Date | null): string {
  if (!date) return 'TBD';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hh}:${mm}Z`;
}

export function firstName(fullName: string | null): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(' ')[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

type SignatureUser = Pick<User, 'fullName' | 'jobTitle' | 'mobile'>;

export function buildSignature(user: SignatureUser): string {
  return (
    `<br>${user.fullName}<br>${user.jobTitle ?? ''}<br>` +
    `Universal Weather & Aviation, Inc.<br>Mobile: ${user.mobile ?? ''}<br>` +
    `<a href='http://www.universalweather.com'>www.universalweather.com</a>`
  );
}

type NotificationLeg = Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'country' | 'arrDate' | 'depDate' | 'captName' | 'agentName'>;

export function buildCrewNotificationEmail(
  leg: NotificationLeg,
  user: SignatureUser,
  agentEmail: string,
  agentPhone: string,
): { subject: string; body: string } {
  const captFirst = firstName(leg.captName);
  const etaTxt = formatZ(leg.arrDate);
  const etdTxt = formatZ(leg.depDate);
  const subject = `UA Crew Notification — ${leg.icao} — Ref: ${leg.tail ?? ''} – ${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings Captain ${captFirst},<br><br>` +
    `As you prepare for your trip to <b>${leg.country ?? ''}</b>, please find below the contact details ` +
    `of our UA supervisory agent for the <b>${leg.icao}</b> stop.<br><br>` +
    `<b>ICAO:</b> ${leg.icao}<br>` +
    `<b>ETA:</b> ${etaTxt}<br>` +
    `<b>ETD:</b> ${etdTxt}<br><br>` +
    `<b>UA Agent:</b> ${leg.agentName ?? ''}<br>` +
    `<b>Mobile / WhatsApp:</b> ${agentPhone}<br>` +
    `<b>Email:</b> <a href='mailto:${agentEmail}'>${agentEmail}</a><br><br>` +
    `The agent will manage all ground logistics before, during, and after your flight. ` +
    `Please contact them directly for any assistance or special requests.<br><br>` +
    `Could you share the following to help us prepare:<br><br>` +
    `1. <b>Passenger Transport:</b> Share driver details so we can coordinate drop-off and pick-up.<br><br>` +
    `2. <b>Third-Party Services:</b> Any other services we can confirm or arrange?<br><br>` +
    `3. <b>Catering:</b> Do you require departure catering? The agent can source local options.<br><br>` +
    `We wish you a safe and pleasant flight.<br><br>Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

export function buildTeamNotificationEmail(
  leg: NotificationLeg,
  team: Pick<Team, 'name'>,
  user: SignatureUser,
  agentEmail: string,
  agentPhone: string,
): { subject: string; body: string } {
  const etaTxt = formatZ(leg.arrDate);
  const etdTxt = formatZ(leg.depDate);
  const subject = `UA Special Service — ${leg.icao} — Ref: ${leg.tail ?? ''} – ${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings ${team.name} Team,<br><br>` +
    `Please load a special service <b>UA Agent</b> with the details below.<br><br>` +
    `<b>ICAO:</b> ${leg.icao}<br>` +
    `<b>ETA:</b> ${etaTxt}<br>` +
    `<b>ETD:</b> ${etdTxt}<br><br>` +
    `<b>UA Agent:</b> ${leg.agentName ?? ''}<br>` +
    `<b>Mobile:</b> ${agentPhone}<br>` +
    `<b>Email:</b> <a href='mailto:${agentEmail}'>${agentEmail}</a><br><br>` +
    `The agent will manage all ground logistics for crew and passengers. Thank you.<br><br>` +
    `Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

type ServiceReportUser = Pick<User, 'fullName' | 'jobTitle' | 'mobile' | 'fromEmail'>;

export function buildAgentServiceReportEmail(
  leg: Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'agentName'>,
  user: ServiceReportUser,
): { subject: string; body: string } {
  const agentFirst = firstName(leg.agentName);
  const subject = `UAA Service Report for ${leg.icao} - Ref: ${leg.tail ?? ''}-${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings ${agentFirst},<br><br>` +
    `Please complete the UAA service report for the upcoming operation and send it to:<br>` +
    `<b>${user.fromEmail}</b>.<br><br>` +
    `Please share the completed report <u>immediately</u> after the crew leaves the airport for arrivals, ` +
    `and right after takeoff for departures. Include any delays, incidents, or other notable events.<br><br>` +
    `Thank you for your support.<br><br>Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

export function buildAgentWhatsAppMessage(
  leg: Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'agentName'>,
  user: Pick<User, 'fullName'>,
): string {
  const agentFirst = firstName(leg.agentName);
  return (
    `Hi ${agentFirst},\n\n` +
    `You've been assigned registry *${leg.tail ?? ''}*, trip *${leg.tripNo}* at ICAO *${leg.icao}*.\n\n` +
    `I've sent the UAA Service Report request to your email. Please fill it out as required.\n\n` +
    `Feel free to WhatsApp me, ${user.fullName}, at this number for any issues. Thank you!`
  );
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
