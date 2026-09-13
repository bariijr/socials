import { isValidServiceTransition, serviceAllowedTransitions } from './statusTransitions';

describe('Submission Pending / Submission Failed transitions', () => {
  it('allows Not Started -> Submission Pending', () => {
    expect(isValidServiceTransition('Not Started', 'Submission Pending')).toBe(true);
  });

  it('allows Chasing -> Submission Pending (re-sending while chasing)', () => {
    // A "Chasing" service already reached 'Requested' once -- resubmitting
    // is a real re-send, not a first-time request, and needs the exact
    // same fail-safety (don't silently claim Requested if the resend
    // fails) as the first-time Not Started path.
    expect(isValidServiceTransition('Chasing', 'Submission Pending')).toBe(true);
  });

  it('allows Submission Pending -> Requested', () => {
    expect(isValidServiceTransition('Submission Pending', 'Requested')).toBe(true);
  });

  it('allows Submission Pending -> Submission Failed', () => {
    expect(isValidServiceTransition('Submission Pending', 'Submission Failed')).toBe(true);
  });

  it('allows Submission Failed -> Submission Pending (retry)', () => {
    expect(isValidServiceTransition('Submission Failed', 'Submission Pending')).toBe(true);
  });

  it('allows Submission Failed -> Not Started (abandon)', () => {
    expect(isValidServiceTransition('Submission Failed', 'Not Started')).toBe(true);
  });

  it('does not allow Submission Pending -> Not Started directly', () => {
    expect(isValidServiceTransition('Submission Pending', 'Not Started')).toBe(false);
  });

  it('does not allow Requested -> Submission Pending', () => {
    expect(isValidServiceTransition('Requested', 'Submission Pending')).toBe(false);
  });

  it('lists the correct allowed transitions for each new state', () => {
    expect(serviceAllowedTransitions('Submission Pending')).toEqual(['Requested', 'Submission Failed']);
    expect(serviceAllowedTransitions('Submission Failed')).toEqual(['Submission Pending', 'Not Started', 'Not Required', 'Cancelled']);
  });

  it('existing Not Started transitions still include the pre-existing edges', () => {
    expect(serviceAllowedTransitions('Not Started')).toEqual(['Requested', 'Submission Pending', 'Not Required', 'Cancelled']);
  });
});

import {
  isValidLegTransition,
  legAllowedTransitions,
  legReopenAllowed,
  withLegTransitions,
} from './statusTransitions';

describe('Leg transitions', () => {
  it('allows Planned -> Active and Planned -> Cancelled', () => {
    expect(isValidLegTransition('Planned', 'Active')).toBe(true);
    expect(isValidLegTransition('Planned', 'Cancelled')).toBe(true);
  });

  it('allows Active -> Completed, Active -> Cancelled, and Active -> Planned', () => {
    expect(isValidLegTransition('Active', 'Completed')).toBe(true);
    expect(isValidLegTransition('Active', 'Cancelled')).toBe(true);
    expect(isValidLegTransition('Active', 'Planned')).toBe(true);
  });

  it('allows Completed -> Active (reopen) and Cancelled -> Planned (reinstate)', () => {
    expect(isValidLegTransition('Completed', 'Active')).toBe(true);
    expect(isValidLegTransition('Cancelled', 'Planned')).toBe(true);
  });

  it('rejects an undefined edge, e.g. Planned -> Completed directly', () => {
    expect(isValidLegTransition('Planned', 'Completed')).toBe(false);
  });

  it('lists the correct allowed transitions for each status with no role', () => {
    expect(legAllowedTransitions('Planned')).toEqual(['Active', 'Cancelled']);
    expect(legAllowedTransitions('Active')).toEqual(['Completed', 'Cancelled', 'Planned']);
    expect(legAllowedTransitions('Cancelled')).toEqual(['Planned']);
  });

  it('hides Completed -> Active from a non-Admin role', () => {
    expect(legReopenAllowed('Completed', 'Coordinator')).toBe(false);
    expect(legAllowedTransitions('Completed', 'Coordinator')).toEqual([]);
  });

  it('offers Completed -> Active to an Admin', () => {
    expect(legReopenAllowed('Completed', 'Admin')).toBe(true);
    expect(legAllowedTransitions('Completed', 'Admin')).toEqual(['Active']);
  });

  it('withLegTransitions attaches allowedTransitions without mutating other fields', () => {
    const leg = { legId: 'L1', status: 'Planned' };
    expect(withLegTransitions(leg)).toEqual({ legId: 'L1', status: 'Planned', allowedTransitions: ['Active', 'Cancelled'] });
  });
});
