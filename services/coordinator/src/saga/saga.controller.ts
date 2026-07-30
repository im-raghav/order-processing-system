import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { SagaService } from './saga.service';
import { CreateSagaDto } from './dto/create-saga.dto';
import { ListSagasQueryDto } from './dto/list-sagas-query.dto';

@Controller('api')
export class SagaController {
  constructor(private readonly sagaService: SagaService) {}

  @Post('orders')
  @HttpCode(202)
  async createOrder(@Body() dto: CreateSagaDto) {
    // fire-and-forget: the saga runs to completion asynchronously, progress is visible via
    // GET /api/orders/:orderId. Not awaiting keeps this endpoint fast even though the
    // downstream steps retry with delays.
    void this.sagaService.createAndRunSaga(dto);
    return { accepted: true, orderId: dto.orderId };
  }

  @Get('orders')
  async listOrders(@Query() query: ListSagasQueryDto) {
    return this.sagaService.listSagas(query.status, query.page, query.pageSize);
  }

  @Get('orders/:orderId')
  async getOrder(@Param('orderId') orderId: string) {
    return this.sagaService.getSagaDetail(orderId);
  }

  @Post('orders/:orderId/retry-compensation')
  async retryCompensation(@Param('orderId') orderId: string) {
    // awaited (not fire-and-forget): a bad request (order isn't Needs-attention) must
    // surface as a 404/409 to the caller, and a manual retry click is not a hot path,
    // so waiting the few seconds for the retried undo(s) to settle is an acceptable trade.
    await this.sagaService.retryCompensation(orderId);
    return { accepted: true };
  }

  @Post('orders/:orderId/mark-shipped')
  async markShipped(@Param('orderId') orderId: string) {
    await this.sagaService.markShipped(orderId);
    return { accepted: true };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
