import { Injectable } from '@nestjs/common';
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
// itself, invoking every one even if an earlier one threw, and
// re-raises the first error afterward so the caller still learns
// something went wrong.
@Injectable()
export class OperationalEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: OperationalEvent): void {
    let firstError: unknown;
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        listener(event);
      } catch (err) {
        if (firstError === undefined) firstError = err;
      }
    }
    if (firstError !== undefined) throw firstError;
  }
}
