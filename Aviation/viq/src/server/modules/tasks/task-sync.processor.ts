import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TaskSyncService } from './task-sync.service';

// Thin transport wrapper -- all logic lives in TaskSyncService.runSync()
// so it stays testable with no queue or timing dependency (see
// task-sync.service.spec.ts). Mirrors DocumentProcessingProcessor's
// split between processor (transport) and service (logic).
@Injectable()
@Processor('task-sync')
export class TaskSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskSyncProcessor.name);

  constructor(private readonly taskSync: TaskSyncService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.taskSync.runSync();
    this.logger.log(`task-sync job complete: ${JSON.stringify(result)}`);
  }
}
