import {
  isValidTaskTransition,
  taskAllowedTransitions,
  withTaskTransitions,
  TASK_TRANSITIONS,
} from './taskStatusTransitions';

describe('taskStatusTransitions', () => {
  it('allows Open -> In Progress', () => {
    expect(isValidTaskTransition('Open', 'In Progress')).toBe(true);
  });

  it('allows Open -> Complete directly (no forced In Progress step)', () => {
    expect(isValidTaskTransition('Open', 'Complete')).toBe(true);
  });

  it('rejects a transition out of a terminal Complete status', () => {
    expect(isValidTaskTransition('Complete', 'Open')).toBe(false);
    expect(taskAllowedTransitions('Complete')).toEqual([]);
  });

  it('rejects a transition out of a terminal Cancelled status', () => {
    expect(isValidTaskTransition('Cancelled', 'Open')).toBe(false);
  });

  it('allows Waiting back to Open (unlike Trip/Service graphs, Waiting is not terminal)', () => {
    expect(isValidTaskTransition('Waiting', 'Open')).toBe(true);
  });

  it('rejects an unknown status entirely', () => {
    expect(isValidTaskTransition('Bogus', 'Open')).toBe(false);
    expect(taskAllowedTransitions('Bogus')).toEqual([]);
  });

  it('withTaskTransitions attaches allowedTransitions from the current status', () => {
    const task = { id: 't1', status: 'Open' };
    expect(withTaskTransitions(task)).toEqual({ id: 't1', status: 'Open', allowedTransitions: TASK_TRANSITIONS['Open'] });
  });
});
