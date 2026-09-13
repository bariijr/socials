import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';
import type { OperationalEventOfType } from '../event-types';

// The event engine's first real, visible consequence: a human-readable
// "Cancelled: <reason>" AuditEntry per record, which the field-diff
// audit.logDiff() every cancel*() method also calls doesn't capture on
// its own (it shows status: Active -> Cancelled, not why). Every other
// consequence (notification, brief regen, financial review) is
// registered by the phase that builds it -- this is the only listener
// this plan ships.
@Injectable()
export class AuditEventListener {
  constructor(private readonly audit: AuditService) {}

  @OnEvent('LEG_CANCELLED')
  async onLegCancelled(e: OperationalEventOfType<'LEG_CANCELLED'>) {
    await this.audit.log(e.user, 'Leg', e.legId, 'Cancelled', '', e.reason);
  }

  @OnEvent('TRIP_CANCELLED')
  async onTripCancelled(e: OperationalEventOfType<'TRIP_CANCELLED'>) {
    await this.audit.log(e.user, 'Trip', e.tripId, 'Cancelled', '', e.reason);
  }

  @OnEvent('SERVICE_CANCELLED')
  async onServiceCancelled(e: OperationalEventOfType<'SERVICE_CANCELLED'>) {
    await this.audit.log(e.user, 'Service', e.svcId, 'Cancelled', '', e.reason);
  }
}
