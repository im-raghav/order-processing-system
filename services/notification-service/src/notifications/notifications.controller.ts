import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { OrderShippedDto } from './dto/order-shipped.dto';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('internal/orders-shipped')
  @HttpCode(200)
  async ordersShipped(@Body() dto: OrderShippedDto) {
    await this.notificationsService.markOrderShipped(dto);
    return { accepted: true };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
