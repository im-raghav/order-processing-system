import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { DoShipmentDto } from './dto/do-shipment.dto';
import { UndoShipmentDto } from './dto/undo-shipment.dto';

@Controller()
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('do')
  @HttpCode(200)
  async do(@Body() dto: DoShipmentDto) {
    return this.shipmentsService.doCreateShipment(dto);
  }

  @Post('undo')
  @HttpCode(200)
  async undo(@Body() dto: UndoShipmentDto) {
    return this.shipmentsService.undoCreateShipment(dto);
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
