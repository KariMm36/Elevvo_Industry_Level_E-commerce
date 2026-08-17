import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        const USE_MOCK =
          process.env.NODE_ENV === 'test' ||
          process.env.USE_REDIS_MOCK === 'true';

        if (USE_MOCK) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const RedisMock = require('ioredis-mock');
          return new RedisMock();
        }

        const client = new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          lazyConnect: true,
          retryStrategy: (times) =>
            times > 3 ? null : Math.min(times * 200, 2000),
        });

        // Graceful error logging (prevents unhandled ECONNREFUSED crashes)
        client.on('error', (err) => {
          console.warn(`[Redis] Connection warning: ${err.message}`);
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
