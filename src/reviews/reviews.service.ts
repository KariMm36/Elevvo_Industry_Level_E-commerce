import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(userId: string, productId: string, dto: CreateReviewDto) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Verified buyer check — must have a completed/delivered order for this product
    const purchasedOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        status: { in: [OrderStatus.DELIVERED, OrderStatus.PAID] },
        items: { some: { productId } },
      },
    });
    if (!purchasedOrder) {
      throw new BadRequestException(
        'You can only review products you have purchased',
      );
    }

    // One review per product per user
    const existing = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing)
      throw new ConflictException('You have already reviewed this product');

    const review = await this.prisma.review.create({
      data: { userId, productId, rating: dto.rating, comment: dto.comment },
      include: { user: { select: { id: true, name: true } } },
    });

    // Recalculate average rating
    const stats = await this.prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: Math.round((stats._avg.rating ?? 0) * 10) / 10,
        totalReviews: stats._count.rating,
      },
    });

    return review;
  }

  async getProductReviews(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.review.findMany({
      where: { productId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
