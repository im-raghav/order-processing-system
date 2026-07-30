import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompStepName, StepName, StepOutcome, StepResultDto } from '@order-system/shared-types';
import { ReservationEntity } from './entities/reservation.entity';
import { DoReservationDto } from './dto/do-reservation.dto';
import { UndoReservationDto } from './dto/undo-reservation.dto';
import { InsufficientStockError } from './insufficient-stock.error';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly reservationsRepository: Repository<ReservationEntity>,
  ) {}

  /**
   * Idempotent reserve. The reservation row (PK = order_id) is inserted first and claims the
   * idempotency key; the inventory decrement only runs on a genuinely fresh insert, inside the
   * same transaction, so a retry/duplicate call never decrements twice. A simulated fail_at
   * failure is decided permanently at the fresh insert and never touches inventory qty at all -
   * same as the other services. A genuine insufficient-stock failure instead rolls the whole
   * transaction back (including the reservation insert) so a later retry starts fresh, since
   * availability can legitimately change if other orders release stock in the meantime.
   */
  async doReserveInventory(dto: DoReservationDto): Promise<StepResultDto> {
    try {
      return await this.reservationsRepository.manager.transaction(async (manager) => {
        const insertResult = await manager.query(
          `INSERT INTO reservations (order_id, sku, qty, fail_at, comp_fail_at, status)
           VALUES (?, ?, ?, ?, ?, 'RESERVED')
           ON DUPLICATE KEY UPDATE order_id = order_id`,
          [dto.orderId, dto.sku, dto.qty, dto.failAt, dto.compFailAt],
        );
        const isFreshInsert = insertResult?.affectedRows === 1;

        const row = await manager.findOneByOrFail(ReservationEntity, { orderId: dto.orderId });

        if (row.failAt === StepName.RESERVE_INVENTORY) {
          return {
            orderId: dto.orderId,
            step: StepName.RESERVE_INVENTORY,
            outcome: StepOutcome.FAILURE,
            alreadyDone: false,
            reason: 'SIMULATED_FAILURE',
          };
        }

        if (isFreshInsert) {
          const decrementResult = await manager.query(
            `UPDATE inventory SET available_qty = available_qty - ? WHERE sku = ? AND available_qty >= ?`,
            [dto.qty, dto.sku, dto.qty],
          );
          if ((decrementResult?.affectedRows ?? 0) === 0) {
            throw new InsufficientStockError();
          }
        }

        return {
          orderId: dto.orderId,
          step: StepName.RESERVE_INVENTORY,
          outcome: StepOutcome.SUCCESS,
          alreadyDone: !isFreshInsert,
        };
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return {
          orderId: dto.orderId,
          step: StepName.RESERVE_INVENTORY,
          outcome: StepOutcome.FAILURE,
          alreadyDone: false,
          reason: 'INSUFFICIENT_STOCK',
        };
      }
      throw err;
    }
  }

  /** Idempotent release: see OrdersService.undoCreateOrder for the conditional-update rationale. */
  async undoReserveInventory(dto: UndoReservationDto): Promise<StepResultDto> {
    const row = await this.reservationsRepository.findOneBy({ orderId: dto.orderId });

    if (row?.compFailAt === CompStepName.RELEASE_INVENTORY) {
      return {
        orderId: dto.orderId,
        step: StepName.RESERVE_INVENTORY,
        outcome: StepOutcome.FAILURE,
        alreadyDone: false,
        reason: 'SIMULATED_COMPENSATION_FAILURE',
      };
    }

    return this.reservationsRepository.manager.transaction(async (manager) => {
      const releaseResult = await manager.query(
        `UPDATE reservations SET status = 'RELEASED' WHERE order_id = ? AND status = 'RESERVED'`,
        [dto.orderId],
      );
      const affectedRows: number = releaseResult?.affectedRows ?? 0;

      if (affectedRows > 0 && row) {
        await manager.query(`UPDATE inventory SET available_qty = available_qty + ? WHERE sku = ?`, [
          row.qty,
          row.sku,
        ]);
      }

      return {
        orderId: dto.orderId,
        step: StepName.RESERVE_INVENTORY,
        outcome: StepOutcome.SUCCESS,
        alreadyDone: affectedRows === 0,
      };
    });
  }
}
