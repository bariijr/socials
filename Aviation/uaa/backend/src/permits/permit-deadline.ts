export interface DeadlineRule {
  leadTimeHours: number;
  workingDaysOnly: boolean;
}

export type Urgency = 'BREACH' | 'URGENT' | 'DUE' | 'OK';

const URGENT_THRESHOLD_HOURS = 24;
const DUE_THRESHOLD_HOURS = 72;

export function computeRequiredByZ(etdZ: string, rule: DeadlineRule): string {
  const etd = new Date(etdZ);
  if (!rule.workingDaysOnly) {
    return new Date(etd.getTime() - rule.leadTimeHours * 3_600_000).toISOString();
  }
  let remainingHours = rule.leadTimeHours;
  let cursor = new Date(etd);
  while (remainingHours > 0) {
    cursor = new Date(cursor.getTime() - 3_600_000);
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remainingHours -= 1;
    }
  }
  return cursor.toISOString();
}

export function computeUrgency(requiredByZ: string, nowZ: string): Urgency {
  const hoursRemaining = (new Date(requiredByZ).getTime() - new Date(nowZ).getTime()) / 3_600_000;
  if (hoursRemaining < 0) return 'BREACH';
  if (hoursRemaining <= URGENT_THRESHOLD_HOURS) return 'URGENT';
  if (hoursRemaining <= DUE_THRESHOLD_HOURS) return 'DUE';
  return 'OK';
}

export function needsReconfirm(basedOnEtdZ: string, currentEtdZ: string, toleranceHours: number): boolean {
  const diffHours = Math.abs(new Date(currentEtdZ).getTime() - new Date(basedOnEtdZ).getTime()) / 3_600_000;
  return diffHours > toleranceHours;
}
