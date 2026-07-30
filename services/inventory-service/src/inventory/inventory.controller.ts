import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { DoReservationDto } from './dto/do-reservation.dto';
import { UndoReservationDto } from './dto/undo-reservation.dto';

@Controller()
export class InventoryController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('do')
  @HttpCode(200)
  async do(@Body() dto: DoReservationDto) {
    return this.reservationsService.doReserveInventory(dto);
  }

  @Post('undo')
  @HttpCode(200)
  async undo(@Body() dto: UndoReservationDto) {
    return this.reservationsService.undoReserveInventory(dto);
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
