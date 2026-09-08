// src/server/common/taskStatusTransitions.ts
//
// Server-side source of truth for which Task status a coordinator may
// move to next -- same convention as src/server/common/statusTransitions.ts
// (TRIP_TRANSITIONS / SERVICE_TRANSITIONS), kept in its own file since
// Task is a new, independent entity rather than an addition to Trip/Service.

export const TASK_TRANSITIONS: Record<string, string[]> = {
  'Open': ['In Progress', 'Waiting', 'Complete', 'Cancelled'],
  'In Progress': ['Waiting', 'Complete', 'Cancelled'],
  'Waiting': ['Open', 'In Progress', 'Complete', 'Cancelled'],
  'Complete': [],
  'Cancelled': [],
};

export function isValidTaskTransition(from: string, to: string): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

export function taskAllowedTransitions(status: string): string[] {
  return TASK_TRANSITIONS[status] ?? [];
}

export function withTaskTransitions<T extends { status: string }>(
  task: T,
): T & { allowedTransitions: string[] } {
  return { ...task, allowedTransitions: taskAllowedTransitions(task.status) };
}
