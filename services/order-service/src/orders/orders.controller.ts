import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DoOrderDto } from './dto/do-order.dto';
import { UndoOrderDto } from './dto/undo-order.dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('do')
  @HttpCode(200)
  async do(@Body() dto: DoOrderDto) {
    return this.ordersService.doCreateOrder(dto);
  }

  @Post('undo')
  @HttpCode(200)
  async undo(@Body() dto: UndoOrderDto) {
    return this.ordersService.undoCreateOrder(dto);
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
