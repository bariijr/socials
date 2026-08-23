import type { PermitRequestStatus } from './permit-request.entity';

export interface ReconfirmInput {
  status: PermitRequestStatus;
  requiredByZ: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
}

export function evaluateReconfirm(
  request: ReconfirmInput,
  currentArrDateZ: Date | null,
  nowZ: Date,
): PermitRequestStatus {
  if (request.status === 'CANCELLED') return request.status;

  if (request.status === 'CONFIRMED') {
    if (request.validFrom && request.validTo && currentArrDateZ) {
      const outsideWindow = currentArrDateZ < request.validFrom || currentArrDateZ > request.validTo;
      if (outsideWindow) return 'RECONFIRM_REQUIRED';
    }
    return request.status;
  }

  if (request.requiredByZ && nowZ > request.requiredByZ) {
    return 'RECONFIRM_REQUIRED';
  }

  return request.status;
}
