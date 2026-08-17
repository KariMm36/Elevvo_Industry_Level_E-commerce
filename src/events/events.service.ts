import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';

const ORDER_QUEUE = 'orders:queue';
const LOW_STOCK_QUEUE = 'events:low-stock';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private isRunning = false;

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  async publishOrderPlaced(
    orderId: string,
    userId: string,
    totalAmount: number,
  ) {
    const event = {
      orderId,
      userId,
      totalAmount,
      publishedAt: new Date().toISOString(),
    };
    await this.redis.lpush(ORDER_QUEUE, JSON.stringify(event));
    this.logger.log(
      `[PUBLISHER] OrderPlaced event queued | OrderID: ${orderId}`,
    );
  }

  publishLowStockAlert(productId: string, currentStock: number) {
    const event = {
      productId,
      currentStock,
      alertedAt: new Date().toISOString(),
    };
    this.redis.lpush(LOW_STOCK_QUEUE, JSON.stringify(event)).catch(() => {});
    this.logger.warn(
      `[LOW-STOCK] Product ${productId} has only ${currentStock} units remaining`,
    );
  }

  startWorker() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.log('[WORKER] Order processing worker started');
    setImmediate(() => this.pollQueue());
  }

  stopWorker() {
    this.isRunning = false;
  }

  private async pollQueue(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const data = await this.redis.rpop(ORDER_QUEUE);
      if (data) {
        const event = JSON.parse(data);
        this.logger.log(
          `[WORKER] Processing order event | OrderID: ${event.orderId}`,
        );
        // Simulate email notification
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        this.logger.log(
          `[WORKER] ✅ Notification sent for Order: ${event.orderId}`,
        );
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    } catch {
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }

    if (this.isRunning) setImmediate(() => this.pollQueue());
  }
}
