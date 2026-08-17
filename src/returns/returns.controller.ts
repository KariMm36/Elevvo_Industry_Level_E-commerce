import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';
import {
  CreateReturnRequestDto,
  ResolveReturnRequestDto,
} from './dto/return.dto';

@ApiTags('Returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class ReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Post('orders/:orderId/returns')
  @ApiOperation({ summary: 'Request a return for a delivered order' })
  requestReturn(
    @Param('orderId') orderId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnsService.requestReturn(orderId, user.id, dto);
  }

  @Get('returns')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] List all return requests' })
  findAll() {
    return this.returnsService.findAll();
  }

  @Patch('returns/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Approve or reject a return request' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ResolveReturnRequestDto,
  ) {
    return this.returnsService.resolveReturn(id, user.id, dto);
  }
}
