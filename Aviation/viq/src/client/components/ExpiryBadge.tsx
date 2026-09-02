import { Badge } from '@/components/ui/badge';
import { expiryTone, type ExpiryTone } from '@/lib/expiry';

// Pass `date` for a labeled per-field badge (e.g. Passport expiry), or a
// pre-computed `tone` (e.g. worst-of across several fields) for a compact
// unlabeled roster-row badge. Renders nothing when the tone is 'none'.
export function ExpiryBadge({ date, tone: toneProp, label }: { date?: string; tone?: ExpiryTone; label?: string }) {
  const tone = toneProp ?? expiryTone(date);
  if (tone === 'none') return null;
  const cls =
    tone === 'expired' || tone === 'missing' ? 'border-rose-300 bg-rose-100 text-rose-700'
    : tone === 'soon' ? 'border-amber-300 bg-amber-100 text-amber-700'
    : 'border-emerald-300 bg-emerald-100 text-emerald-700';
  const text = tone === 'expired' ? 'EXPIRED' : tone === 'missing' ? 'MISSING DATA' : tone === 'soon' ? 'EXPIRES SOON' : 'OK';
  return <Badge variant="outline" className={`text-[9px] ${cls}`}>{label ? `${label} ${text}` : text}</Badge>;
}
