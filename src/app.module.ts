import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { AddressesModule } from './addresses/addresses.module';
import { ProductsModule } from './products/products.module';
import { CurrencyModule } from './currency/currency.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { ReturnsModule } from './returns/returns.module';
import { ReviewsModule } from './reviews/reviews.module';
import { HealthModule } from './health/health.module';
import { ThrottlerStorageRedisService } from './common/throttler/throttler-storage-redis.service';

@Module({
  imports: [
    // Config (loads .env)
    ConfigModule.forRoot({ isGlobal: true }),

    // Infrastructure (global)
    PrismaModule,
    RedisModule,
    EventsModule,
    CurrencyModule,

    // Distributed Rate Limiting (Redis-backed Throttler Storage)
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),

    // Feature modules
    AuthModule,
    AddressesModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    ReturnsModule,
    ReviewsModule,
    HealthModule,
  ],
  providers: [
    // Apply global rate limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
