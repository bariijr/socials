import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { OperationalEvent } from './event-types';

// Thin on purpose. `.emit()` is synchronous, in-process fan-out to
// whatever's registered via @OnEvent -- there is no queue, no
// persistence, and no retry here. A future listener whose consequence
// genuinely needs durable async work (a real send, a PDF render) opens
// its own dedicated BullMQ queue and enqueues from inside itself,
// mirroring documents.service.ts's queue.add() pattern -- this service
// never does that on a listener's behalf. See the design doc's Ruling 1.
//
// EventEmitter2's own `.emit()` stops calling further listeners the
// moment one throws, which would let a broken listener silently starve
// its siblings. `.emit()` here instead walks the registered listeners
// itself, invoking every one even if an earlier one threw.
//
// The "caller learns about a listener failure" guarantee below only
// holds for a SYNCHRONOUS listener: its throw is caught in-loop and
// re-raised to this call's own caller once every listener has run. An
// `async` @OnEvent listener (every handler in AuditEventListener is
// one) only runs synchronously up to its first `await` -- by the time
// it rejects, `emit()` has already returned, so that rejection cannot
// be re-thrown here without crashing the process as an unhandled
// rejection. Instead it's caught via `.catch()` and logged; the caller
// of `emit()` never sees it.
@Injectable()
export class OperationalEventsService {
  private readonly logger = new Logger(OperationalEventsService.name);

  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: OperationalEvent): void {
    let firstError: unknown;
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: OperationalEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Async listener for ${event.type} failed: ${message}`);
          });
        }
      } catch (err) {
        if (firstError === undefined) firstError = err;
      }
    }
    if (firstError !== undefined) throw firstError;
  }
}
