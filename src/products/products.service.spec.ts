import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { EventsService } from '../events/events.service';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: any;
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
  };
  let events: { publishLowStockAlert: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
      inventoryAuditLog: {
        create: jest.fn(),
      },
    };

    redis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn().mockResolvedValue([]),
    };

    events = {
      publishLowStockAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: EventsService, useValue: events },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('findOne (Cache-Aside)', () => {
    it('should return cached product if present in Redis', async () => {
      const mockProduct = { id: 'p1', name: 'Laptop', price: 999 };
      redis.get.mockResolvedValue(JSON.stringify(mockProduct));

      const result = await service.findOne('p1');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('should query database on cache miss and save to Redis with 1h TTL', async () => {
      redis.get.mockResolvedValue(null);
      const mockProduct = { id: 'p1', name: 'Laptop', price: 999 };
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne('p1');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'product:p1',
        3600,
        JSON.stringify(mockProduct),
      );
    });

    it('should throw NotFoundException if product is not in database', async () => {
      redis.get.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('p99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update (Active Cache Invalidation)', () => {
    it('should update product in DB and purge Redis cache key', async () => {
      const existing = { id: 'p1', name: 'Laptop', price: 999 };
      redis.get.mockResolvedValue(JSON.stringify(existing));
      prisma.product.update.mockResolvedValue({ ...existing, price: 899 });

      await service.update('p1', { price: 899 });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { price: 899 },
      });
      expect(redis.del).toHaveBeenCalledWith('product:p1');
    });
  });

  describe('deductStock & Low-Stock Alerts', () => {
    it('should deduct stock, create audit log, and emit low stock alert if below threshold', async () => {
      const updatedProduct = {
        id: 'p1',
        name: 'Laptop',
        stock: 3,
        lowStockThreshold: 5,
      };
      prisma.product.update.mockResolvedValue(updatedProduct);
      prisma.inventoryAuditLog.create.mockResolvedValue({});

      await service.deductStock(prisma, 'p1', 2, 'user-123');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { decrement: 2 } },
      });
      expect(prisma.inventoryAuditLog.create).toHaveBeenCalledWith({
        data: {
          productId: 'p1',
          previousStock: 5,
          newStock: 3,
          changeReason: 'CHECKOUT',
          changedBy: 'user-123',
        },
      });
      expect(events.publishLowStockAlert).toHaveBeenCalledWith('p1', 3);
      expect(redis.del).toHaveBeenCalledWith('product:p1');
    });
  });
});
