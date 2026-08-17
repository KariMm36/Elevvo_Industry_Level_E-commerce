import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiHeader,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CurrencyService } from '../currency/currency.service';

@ApiTags('Products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private currencyService: CurrencyService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] Create a new product' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List products with filtering, search & pagination',
  })
  @ApiHeader({
    name: 'x-currency',
    required: false,
    description: 'USD | EUR | EGP | SAR',
  })
  async findAll(
    @Query() query: ProductQueryDto,
    @Headers('x-currency') currency = 'USD',
  ) {
    const result = await this.productsService.findAll(query);
    return this.currencyService.convertProductList(
      result,
      currency.toUpperCase(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID' })
  @ApiHeader({
    name: 'x-currency',
    required: false,
    description: 'USD | EUR | EGP | SAR',
  })
  async findOne(
    @Param('id') id: string,
    @Headers('x-currency') currency = 'USD',
  ) {
    const product = await this.productsService.findOne(id);
    return this.currencyService.convertProduct(product, currency.toUpperCase());
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] Update a product' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] Delete a product' })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
