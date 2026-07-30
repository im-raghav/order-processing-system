import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompStepName, StepName, StepOutcome, StepResultDto } from '@order-system/shared-types';
import { OrderEntity, OrderRecordStatus } from './entities/order.entity';
import { DoOrderDto } from './dto/do-order.dto';
import { UndoOrderDto } from './dto/undo-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
  ) {}

  /**
   * Idempotent create. The INSERT ... ON DUPLICATE KEY UPDATE is a no-op on a retry/duplicate
   * call, so whichever call happened first is the one that permanently decided fail_at's
   * outcome for this order - a later replay reads back that same stored decision rather than
   * re-deciding, which is what keeps this safe under BullMQ retries or concurrent replicas.
   */
  async doCreateOrder(dto: DoOrderDto): Promise<StepResultDto> {
    await this.ordersRepository.manager.query(
      `INSERT INTO orders (order_id, sku, qty, amount, fail_at, comp_fail_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'CREATED')
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      [dto.orderId, dto.sku, dto.qty, dto.amount, dto.failAt, dto.compFailAt],
    );

    const row = await this.ordersRepository.findOneByOrFail({ orderId: dto.orderId });

    if (row.failAt === StepName.CREATE_ORDER) {
      return {
        orderId: dto.orderId,
        step: StepName.CREATE_ORDER,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_FAILURE',
      };
    }

    return {
      orderId: dto.orderId,
      step: StepName.CREATE_ORDER,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: false,
    };
  }

  /**
   * Idempotent undo. A conditional UPDATE that only flips CREATED -> CANCELLED: 0 rows
   * affected means this order was already cancelled (or never created) by an earlier call,
   * so it's reported back as an already-done success rather than repeating any side effect.
   * comp_fail_at is read from the row this service stored at create time (never trusted from
   * the caller), so a stuck compensation keeps failing deterministically until someone fixes
   * the underlying condition and hits Retry.
   */
  async undoCreateOrder(dto: UndoOrderDto): Promise<StepResultDto> {
    const row = await this.ordersRepository.findOneBy({ orderId: dto.orderId });

    if (row?.compFailAt === CompStepName.CANCEL_ORDER) {
      return {
        orderId: dto.orderId,
        step: StepName.CREATE_ORDER,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_COMPENSATION_FAILURE',
      };
    }

    const result = await this.ordersRepository.manager.query(
      `UPDATE orders SET status = 'CANCELLED' WHERE order_id = ? AND status = 'CREATED'`,
      [dto.orderId],
    );
    const affectedRows: number = result?.affectedRows ?? 0;

    return {
      orderId: dto.orderId,
      step: StepName.CREATE_ORDER,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: affectedRows === 0,
    };
  }
}
