import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  Headers,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/order.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Idempotent atomic checkout — converts cart to order',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Prevent duplicate checkout',
  })
  checkout(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CheckoutDto,
    @Headers('x-idempotency-key') idempKey?: string,
  ) {
    if (idempKey && !dto.idempotencyKey) dto.idempotencyKey = idempKey;
    return this.ordersService.checkout(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders for current user' })
  findMyOrders(@CurrentUser() user: { id: string }) {
    return this.ordersService.findUserOrders(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific order by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.ordersService.findOne(id, user.id, user.role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update order status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }

  @Delete(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel an order and restore inventory stock atomically',
  })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.ordersService.cancelOrder(id, user.id, user.role);
  }
}
