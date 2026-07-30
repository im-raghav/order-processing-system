import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DoPaymentDto } from './dto/do-payment.dto';
import { UndoPaymentDto } from './dto/undo-payment.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('do')
  @HttpCode(200)
  async do(@Body() dto: DoPaymentDto) {
    return this.paymentsService.doChargePayment(dto);
  }

  @Post('undo')
  @HttpCode(200)
  async undo(@Body() dto: UndoPaymentDto) {
    return this.paymentsService.undoChargePayment(dto);
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
