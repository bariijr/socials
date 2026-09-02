import type { Person, PersonRating, PersonRole } from '@/data/types';

export type ExpiryTone = 'expired' | 'missing' | 'soon' | 'ok' | 'none';

const SOON_WINDOW_DAYS = 60;

export function expiryTone(dateStr?: string): ExpiryTone {
  if (!dateStr) return 'none';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'none';
  const diffDays = (d.getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= SOON_WINDOW_DAYS) return 'soon';
  return 'ok';
}

// 'expired' and 'missing' are tied at the top: an expired cert and a cert
// with no data on file are both "cannot confirm this person is compliant
// right now" — neither is worse than the other for dashboard purposes.
const SEVERITY: Record<ExpiryTone, number> = { expired: 3, missing: 3, soon: 2, ok: 1, none: 0 };

// Roles that must carry a medical cert and passport to be operationally
// usable — used to flag *missing* data, not just expiring data, on these
// roles only. A Pax/VIP/Principal/Other record with no medical cert isn't
// a problem; a PIC record with none is.
export const CREW_ROLES: PersonRole[] = ['PIC', 'SIC', 'FA', 'Mechanic', 'Engineer'];

export interface ExpiryIssueLine {
  label: string;
  tone: 'expired' | 'missing' | 'soon';
  date?: string;
}

export interface PersonExpiryStatus {
  // 'ok' only when at least one expiry-bearing field has a known, non-expiring
  // date and nothing needs attention; 'none' when there's nothing on file at
  // all and none of it was required (non-crew role).
  worstTone: ExpiryTone;
  issues: ExpiryIssueLine[];
}

// The single place per-person expiry/compliance severity is computed —
// every UI that shows an expiry badge (roster rows, the person detail
// header, the roster-wide dashboard) calls this rather than re-deriving
// its own notion of "worst".
export function personExpiryStatus(person: Person, ratings: PersonRating[]): PersonExpiryStatus {
  const isCrew = !!person.DefaultRole && CREW_ROLES.includes(person.DefaultRole);
  const issues: ExpiryIssueLine[] = [];
  let anyKnownDate = false;

  const checkField = (label: string, date: string | undefined, requiredForCrew: boolean) => {
    if (date) {
      anyKnownDate = true;
      const tone = expiryTone(date);
      if (tone === 'expired' || tone === 'soon') issues.push({ label, tone, date });
    } else if (requiredForCrew && isCrew) {
      issues.push({ label, tone: 'missing' });
    }
  };

  checkField('PASSPORT', person.PassportExpiryDate, true);
  checkField('MEDICAL CERT', person.MedicalValidUntil, true);
  ratings.forEach((r) => checkField(r.RatingType.toUpperCase(), r.ExpiryDate, false));

  const worstTone: ExpiryTone = issues.length > 0
    ? issues.reduce<ExpiryTone>((worst, i) => (SEVERITY[i.tone] > SEVERITY[worst] ? i.tone : worst), 'none')
    : (anyKnownDate ? 'ok' : 'none');

  return { worstTone, issues };
}
