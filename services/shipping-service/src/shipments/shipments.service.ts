import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompStepName, StepName, StepOutcome, StepResultDto } from '@order-system/shared-types';
import { ShipmentEntity } from './entities/shipment.entity';
import { DoShipmentDto } from './dto/do-shipment.dto';
import { UndoShipmentDto } from './dto/undo-shipment.dto';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly shipmentsRepository: Repository<ShipmentEntity>,
  ) {}

  /** Idempotent create: see OrdersService.doCreateOrder for the insert-or-return rationale. */
  async doCreateShipment(dto: DoShipmentDto): Promise<StepResultDto> {
    await this.shipmentsRepository.manager.query(
      `INSERT INTO shipments (order_id, sku, qty, fail_at, comp_fail_at, status)
       VALUES (?, ?, ?, ?, ?, 'ARRANGED')
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      [dto.orderId, dto.sku, dto.qty, dto.failAt, dto.compFailAt],
    );

    const row = await this.shipmentsRepository.findOneByOrFail({ orderId: dto.orderId });

    if (row.failAt === StepName.CREATE_SHIPMENT) {
      return {
        orderId: dto.orderId,
        step: StepName.CREATE_SHIPMENT,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_FAILURE',
      };
    }

    return {
      orderId: dto.orderId,
      step: StepName.CREATE_SHIPMENT,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: false,
    };
  }

  /** Idempotent undo: see OrdersService.undoCreateOrder for the conditional-update rationale. */
  async undoCreateShipment(dto: UndoShipmentDto): Promise<StepResultDto> {
    const row = await this.shipmentsRepository.findOneBy({ orderId: dto.orderId });

    if (row?.compFailAt === CompStepName.CANCEL_SHIPMENT) {
      return {
        orderId: dto.orderId,
        step: StepName.CREATE_SHIPMENT,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_COMPENSATION_FAILURE',
      };
    }

    const result = await this.shipmentsRepository.manager.query(
      `UPDATE shipments SET status = 'CANCELLED' WHERE order_id = ? AND status = 'ARRANGED'`,
      [dto.orderId],
    );
    const affectedRows: number = result?.affectedRows ?? 0;

    return {
      orderId: dto.orderId,
      step: StepName.CREATE_SHIPMENT,
      outcome: StepOutcome.SUCCESS,
      alreadyDone: affectedRows === 0,
    };
  }
}
