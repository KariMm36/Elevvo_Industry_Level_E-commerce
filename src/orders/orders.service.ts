import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { EventsService } from '../events/events.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/order.dto';

const IDEMPOTENCY_TTL = 86400; // 24 hours

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private productsService: ProductsService,
    private eventsService: EventsService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    // ── Idempotency Check ─────────────────────────────────────────────
    if (dto.idempotencyKey) {
      const idempKey = `idempotency:${dto.idempotencyKey}`;
      const existing = await this.redis.get(idempKey);
      if (existing) {
        const existingOrder = await this.prisma.order.findUnique({
          where: { id: existing },
          include: { items: { include: { product: true } } },
        });
        if (existingOrder) return existingOrder; // Return cached result
      }
    }

    // ── Load Cart ─────────────────────────────────────────────────────
    const cart = await this.cartService.getCart(userId);
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    // ── Load Default Address ──────────────────────────────────────────
    const address = dto.addressId
      ? await this.prisma.address.findFirst({
          where: { id: dto.addressId, userId },
        })
      : await this.prisma.address.findFirst({
          where: { userId, isDefault: true },
        });

    if (!address)
      throw new BadRequestException(
        'No shipping address found. Please add an address first.',
      );

    // ── Atomic Transaction ────────────────────────────────────────────
    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const orderItems: Array<{
        productId: string;
        quantity: number;
        price: number;
      }> = [];

      for (const item of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product)
          throw new NotFoundException(`Product ${item.productId} not found`);
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`,
          );
        }

        // Deduct stock
        const updated = await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } },
        });

        // Audit log
        await tx.inventoryAuditLog.create({
          data: {
            productId: product.id,
            previousStock: product.stock,
            newStock: updated.stock,
            changeReason: 'CHECKOUT',
            changedBy: userId,
          },
        });

        totalAmount += product.price * item.quantity;
        orderItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.price,
        });

        // Low-stock alert (outside tx to avoid blocking)
        if (updated.stock <= product.lowStockThreshold) {
          setImmediate(() =>
            this.eventsService.publishLowStockAlert(product.id, updated.stock),
          );
        }
      }

      // Create order with address snapshot
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount: Math.round(totalAmount * 100) / 100,
          idempotencyKey: dto.idempotencyKey,
          shippingStreet: address.street,
          shippingCity: address.city,
          shippingState: address.state,
          shippingCountry: address.country,
          shippingZip: address.postalCode,
          currency: dto.currency ?? 'USD',
          items: { create: orderItems },
        },
        include: { items: { include: { product: true } } },
      });

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // ── Cache Idempotency Result ──────────────────────────────────────
    if (dto.idempotencyKey) {
      await this.redis.setex(
        `idempotency:${dto.idempotencyKey}`,
        IDEMPOTENCY_TTL,
        order.id,
      );
    }

    // ── Publish Event ─────────────────────────────────────────────────
    await this.eventsService.publishOrderPlaced(
      order.id,
      userId,
      order.totalAmount,
    );

    return order;
  }

  async findUserOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, returnRequests: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (role !== Role.ADMIN && order.userId !== userId)
      throw new ForbiddenException();
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, _adminId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async cancelOrder(orderId: string, userId: string, role: string) {
    const order = await this.findOne(orderId, userId, role);

    const cancellable: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PAID];
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order in "${order.status}" status. Only PENDING or PAID orders can be cancelled.`,
      );
    }

    // Atomic: cancel + restore stock
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });

        await tx.inventoryAuditLog.create({
          data: {
            productId: item.productId,
            previousStock: updated.stock - item.quantity,
            newStock: updated.stock,
            changeReason: 'CANCEL_RESTOCK',
            changedBy: userId,
          },
        });
      }

      return cancelled;
    });
  }
}
