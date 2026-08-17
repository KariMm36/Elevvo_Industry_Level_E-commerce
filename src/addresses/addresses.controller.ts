import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/address.dto';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/addresses')
export class AddressesController {
  constructor(private addressesService: AddressesService) {}

  @Post()
  @ApiOperation({ summary: 'Add a new shipping address' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all saved addresses' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.addressesService.findAll(user.id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set an address as the default shipping address' })
  setDefault(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.addressesService.setDefault(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.addressesService.remove(id, user.id);
  }
}
