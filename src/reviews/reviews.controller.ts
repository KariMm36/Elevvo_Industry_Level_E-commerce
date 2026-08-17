import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';

@ApiTags('Reviews')
@Controller('api/v1/products/:productId/reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit a verified-buyer review for a product' })
  createReview(
    @Param('productId') productId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.id, productId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all reviews for a product' })
  getReviews(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviews(productId);
  }
}
