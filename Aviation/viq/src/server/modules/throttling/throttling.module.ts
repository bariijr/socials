import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

// Global so any controller can @UseGuards(ThrottlerGuard) directly without
// importing this module — the shared Redis-backed storage is what makes
// rate limits correct across multiple server instances, not just one.
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60000, limit: 5 }],
        storage: new ThrottlerStorageRedisService(process.env.REDIS_URL || 'redis://localhost:6389'),
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottlingModule {}
