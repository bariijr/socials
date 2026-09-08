import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskSyncService } from './task-sync.service';
import { TaskSyncProcessor } from './task-sync.processor';

const TASK_SYNC_REPEAT_JOB_ID = 'task-sync-repeat';
const TASK_SYNC_INTERVAL_MS = 10 * 60 * 1000;

@Module({
  imports: [BullModule.registerQueue({ name: 'task-sync' })],
  controllers: [TasksController],
  providers: [TasksService, TaskSyncService, TaskSyncProcessor],
  exports: [TasksService, TaskSyncService],
})
export class TasksModule implements OnModuleInit {
  constructor(@InjectQueue('task-sync') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Idempotent: BullMQ dedupes repeatable jobs sharing the same jobId +
    // repeat config, so this is safe to run on every app boot without
    // creating duplicate schedules.
    await this.queue.add(
      'sync',
      {},
      { jobId: TASK_SYNC_REPEAT_JOB_ID, repeat: { every: TASK_SYNC_INTERVAL_MS } } as any,
    );
  }
}
