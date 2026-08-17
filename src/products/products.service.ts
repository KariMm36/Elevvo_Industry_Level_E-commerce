import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { EventsService } from '../events/events.service';

const CACHE_TTL = 3600; // 1 hour

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private eventsService: EventsService,
  ) {}

  private cacheKey(id: string) {
    return `product:${id}`;
  }

  private listCacheKey(query: ProductQueryDto) {
    return `products:list:${JSON.stringify(query)}`;
  }

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });
    if (existing)
      throw new ConflictException(
        `Product with SKU "${dto.sku}" already exists`,
      );

    const product = await this.prisma.product.create({ data: dto });
    await this.invalidateListCache();
    return product;
  }

  async findAll(query: ProductQueryDto) {
    const cacheKey = this.listCacheKey(query);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const {
      category,
      search,
      minPrice,
      maxPrice,
      page = 1,
      limit = 10,
    } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined)
        (where.price as Record<string, number>).gte = minPrice;
      if (maxPrice !== undefined)
        (where.price as Record<string, number>).lte = maxPrice;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip, take: limit }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async findOne(id: string) {
    const cacheKey = this.cacheKey(id);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(product));
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id); // validates existence
    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
    });

    // Purge cache
    await this.redis.del(this.cacheKey(id));
    await this.invalidateListCache();
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    await this.redis.del(this.cacheKey(id));
    await this.invalidateListCache();
    return { message: 'Product deleted successfully' };
  }

  private async invalidateListCache() {
    const keys = await this.redis.keys('products:list:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // Called by OrdersService after checkout
  async deductStock(
    prismaClient: PrismaService,
    productId: string,
    quantity: number,
    changedBy: string,
  ) {
    const product = await prismaClient.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });

    await prismaClient.inventoryAuditLog.create({
      data: {
        productId,
        previousStock: product.stock + quantity,
        newStock: product.stock,
        changeReason: 'CHECKOUT',
        changedBy,
      },
    });

    // Low-stock alert
    if (product.stock <= product.lowStockThreshold) {
      this.eventsService.publishLowStockAlert(productId, product.stock);
    }

    // Purge cache
    await this.redis.del(this.cacheKey(productId));
    return product;
  }

  async restoreStock(
    prismaClient: PrismaService,
    productId: string,
    quantity: number,
    changedBy: string,
    reason: 'CANCEL_RESTOCK' | 'RETURN_RESTOCK',
  ) {
    const product = await prismaClient.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });

    await prismaClient.inventoryAuditLog.create({
      data: {
        productId,
        previousStock: product.stock - quantity,
        newStock: product.stock,
        changeReason: reason,
        changedBy,
      },
    });

    await this.redis.del(this.cacheKey(productId));
    return product;
  }
}
