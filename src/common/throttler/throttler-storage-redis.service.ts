import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { Redis } from 'ioredis';

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:blocked:${throttlerName}:${key}`;

    const isBlocked = await this.redis.get(blockKey);
    if (isBlocked) {
      const timeToBlockExpire = await this.redis.pttl(blockKey);
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(timeToBlockExpire / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
      };
    }

    const totalHits = await this.redis.incr(redisKey);
    let timeToExpire = await this.redis.pttl(redisKey);

    if (totalHits === 1 || timeToExpire === -1) {
      await this.redis.pexpire(redisKey, ttl);
      timeToExpire = ttl;
    }

    if (totalHits > limit && blockDuration > 0) {
      await this.redis.psetex(blockKey, blockDuration, '1');
      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpire / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
