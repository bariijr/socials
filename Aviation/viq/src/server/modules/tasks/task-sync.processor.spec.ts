import { TaskSyncProcessor } from './task-sync.processor';
import { TaskSyncService } from './task-sync.service';

describe('TaskSyncProcessor', () => {
  it('delegates to TaskSyncService.runSync()', async () => {
    const runSync = jest.fn().mockResolvedValue({ created: 1, closed: 0, escalated: 0 });
    const taskSync = { runSync } as unknown as TaskSyncService;
    const processor = new TaskSyncProcessor(taskSync);
    await processor.process({} as any);
    expect(runSync).toHaveBeenCalledTimes(1);
  });
});
