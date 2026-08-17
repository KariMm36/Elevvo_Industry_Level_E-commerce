import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateReturnRequestDto,
  ResolveReturnRequestDto,
} from './dto/return.dto';

@Injectable()
export class ReturnsService {
  constructor(private prisma: PrismaService) {}

  async requestReturn(
    orderId: string,
    userId: string,
    dto: CreateReturnRequestDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { returnRequests: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Returns can only be requested for DELIVERED orders',
      );
    }
    if (order.returnRequests.some((r) => r.status === ReturnStatus.REQUESTED)) {
      throw new ConflictException(
        'A return request is already pending for this order',
      );
    }

    return this.prisma.returnRequest.create({
      data: { orderId, userId, reason: dto.reason },
    });
  }

  async resolveReturn(
    returnId: string,
    adminId: string,
    dto: ResolveReturnRequestDto,
  ) {
    const returnReq = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { order: { include: { items: true } } },
    });

    if (!returnReq) throw new NotFoundException('Return request not found');
    if (returnReq.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException('Return request already resolved');
    }

    if (dto.action === 'APPROVED') {
      return this.prisma.$transaction(async (tx) => {
        const resolved = await tx.returnRequest.update({
          where: { id: returnId },
          data: {
            status: ReturnStatus.APPROVED,
            resolvedBy: adminId,
            resolvedAt: new Date(),
          },
        });

        await tx.order.update({
          where: { id: returnReq.orderId },
          data: { status: OrderStatus.CANCELLED },
        });

        // Restore stock atomically
        for (const item of returnReq.order.items) {
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

          await tx.inventoryAuditLog.create({
            data: {
              productId: item.productId,
              previousStock: updated.stock - item.quantity,
              newStock: updated.stock,
              changeReason: 'RETURN_RESTOCK',
              changedBy: adminId,
            },
          });
        }

        return resolved;
      });
    }

    // Rejected
    return this.prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        status: ReturnStatus.REJECTED,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });
  }

  async findAll() {
    return this.prisma.returnRequest.findMany({
      include: {
        order: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
