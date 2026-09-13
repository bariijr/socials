import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationalEventsService } from './operational-events.service';
import { AuditEventListener } from './listeners/audit-event.listener';

@Module({
  imports: [AuditModule],
  providers: [OperationalEventsService, AuditEventListener],
  exports: [OperationalEventsService],
})
export class OperationalEventsModule {}
