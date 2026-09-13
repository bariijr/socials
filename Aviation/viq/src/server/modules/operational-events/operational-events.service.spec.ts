import { EventEmitter2 } from '@nestjs/event-emitter';
import { OperationalEventsService } from './operational-events.service';

describe('OperationalEventsService', () => {
  let emitter: EventEmitter2;
  let service: OperationalEventsService;

  beforeEach(() => {
    emitter = new EventEmitter2();
    service = new OperationalEventsService(emitter);
  });

  it('fans out to every listener registered for that event type', () => {
    const received: unknown[] = [];
    emitter.on('LEG_CANCELLED', (e) => received.push(e));
    emitter.on('LEG_CANCELLED', (e) => received.push(e));

    const event = { type: 'LEG_CANCELLED' as const, legId: 'L1', tripId: 'T1', reason: 'Weather', user: 'coordinator' };
    service.emit(event);

    expect(received).toEqual([event, event]);
  });

  it('is a no-op for an event type with no registered listener', () => {
    expect(() => service.emit({ type: 'TASK_OVERDUE', taskId: 'TASK-1' })).not.toThrow();
  });

  it('one listener throwing does not prevent a sibling listener for the same event from running', () => {
    const received: unknown[] = [];
    emitter.on('TRIP_CANCELLED', () => { throw new Error('boom'); });
    emitter.on('TRIP_CANCELLED', (e) => received.push(e));

    const event = { type: 'TRIP_CANCELLED' as const, tripId: 'T1', reason: 'Weather', user: 'coordinator' };
    // EventEmitter2's default (non-async) emit invokes every listener
    // synchronously in sequence; a thrown error inside one listener
    // propagates to the caller of .emit() by default, so this test
    // documents that behavior rather than asserting silence -- see
    // Step 3's listener itself for why the real AuditEventListener
    // never lets this matter in practice (it never throws for a normal
    // audit write).
    expect(() => service.emit(event)).toThrow('boom');
    expect(received).toEqual([event]);
  });

  it('does not produce an unhandled rejection when an async listener rejects', async () => {
    // AuditEventListener's real handlers are all `async` and `await`
    // AuditService.log(...) -- an `async` function only runs
    // synchronously up to its first `await`, so a rejection surfaces
    // after emit() has already returned and cannot be caught by a plain
    // synchronous try/catch around the call. This proves that case is
    // swallowed (and logged) rather than escaping as an unhandled
    // rejection, which would otherwise crash the process (Node 15+
    // default behavior) once a real cancellation flow hits a transient
    // DB error inside a listener.
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      emitter.on('SERVICE_CANCELLED', async () => {
        throw new Error('async boom');
      });

      const event = {
        type: 'SERVICE_CANCELLED' as const,
        svcId: 'S1',
        tripId: 'T1',
        providerId: null,
        reason: 'Weather',
        user: 'coordinator',
      };

      expect(() => service.emit(event)).not.toThrow();

      // Give the rejected promise's microtask -- and this service's own
      // .catch() on it -- a turn to run before asserting nothing escaped.
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
