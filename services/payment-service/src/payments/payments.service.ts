import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompStepName, StepName, StepOutcome, StepResultDto } from '@order-system/shared-types';
import { PaymentEntity } from './entities/payment.entity';
import { DoPaymentDto } from './dto/do-payment.dto';
import { UndoPaymentDto } from './dto/undo-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepository: Repository<PaymentEntity>,
  ) {}

  /** Idempotent charge: see OrdersService.doCreateOrder for the insert-or-return rationale. */
  async doChargePayment(dto: DoPaymentDto): Promise<StepResultDto> {
    await this.paymentsRepository.manager.query(
      `INSERT INTO payments (order_id, amount, fail_at, comp_fail_at, status)
       VALUES (?, ?, ?, ?, 'CHARGED')
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      [dto.orderId, dto.amount, dto.failAt, dto.compFailAt],
    );

    const row = await this.paymentsRepository.findOneByOrFail({ orderId: dto.orderId });

    if (row.failAt === StepName.CHARGE_PAYMENT) {
      return {
        orderId: dto.orderId,
        step: StepName.CHARGE_PAYMENT,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_FAILURE',
      };
    }

    return {
      orderId: dto.orderId,
      step: StepName.CHARGE_PAYMENT,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: false,
    };
  }

  /** Idempotent refund: see OrdersService.undoCreateOrder for the conditional-update rationale. */
  async undoChargePayment(dto: UndoPaymentDto): Promise<StepResultDto> {
    const row = await this.paymentsRepository.findOneBy({ orderId: dto.orderId });

    if (row?.compFailAt === CompStepName.REFUND_PAYMENT) {
      return {
        orderId: dto.orderId,
        step: StepName.CHARGE_PAYMENT,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_COMPENSATION_FAILURE',
      };
    }

    const result = await this.paymentsRepository.manager.query(
      `UPDATE payments SET status = 'REFUNDED' WHERE order_id = ? AND status = 'CHARGED'`,
      [dto.orderId],
    );
    const affectedRows: number = result?.affectedRows ?? 0;

    return {
      orderId: dto.orderId,
      step: StepName.CHARGE_PAYMENT,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: affectedRows === 0,
    };
  }
}
