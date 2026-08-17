import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';

// Hardcoded exchange rates relative to USD (cached in Redis, refreshable)
const BASE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  EGP: 49.5,
  SAR: 3.75,
};

const RATE_CACHE_TTL = 3600; // 1 hour

@Injectable()
export class CurrencyService {
  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  private async getRate(currency: string): Promise<number> {
    const cacheKey = `exchange_rate:${currency}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return parseFloat(cached);

    const rate = BASE_RATES[currency] ?? 1.0;
    await this.redis.setex(cacheKey, RATE_CACHE_TTL, rate.toString());
    return rate;
  }

  async convertPrice(priceUsd: number, currency: string): Promise<number> {
    if (currency === 'USD') return priceUsd;
    const rate = await this.getRate(currency);
    return Math.round(priceUsd * rate * 100) / 100;
  }

  async convertProduct(product: Record<string, unknown>, currency: string) {
    if (currency === 'USD') return product;
    const convertedPrice = await this.convertPrice(
      product.price as number,
      currency,
    );
    return { ...product, price: convertedPrice, currency };
  }

  async convertProductList(
    result: { items: Record<string, unknown>[]; [key: string]: unknown },
    currency: string,
  ) {
    if (currency === 'USD') return result;
    const items = await Promise.all(
      result.items.map((p) => this.convertProduct(p, currency)),
    );
    return { ...result, items, currency };
  }
}
