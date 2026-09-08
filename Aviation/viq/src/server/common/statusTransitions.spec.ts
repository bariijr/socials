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
