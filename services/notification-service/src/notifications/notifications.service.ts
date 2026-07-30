import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { OrderShippedDto } from './dto/order-shipped.dto';

const SCAN_BATCH_SIZE = 500;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
  ) {}

  /** Idempotent: a duplicate push for the same order (e.g. the coordinator's retry after a
   * transient failure) is a no-op insert, so at most one PENDING row is ever created. */
  async markOrderShipped(dto: OrderShippedDto): Promise<void> {
    await this.notificationsRepository.manager.query(
      `INSERT INTO notifications (order_id, status, shipped_at)
       VALUES (?, 'PENDING', ?)
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      [dto.orderId, new Date(dto.shippedAt)],
    );
  }

  /**
   * Scans for PENDING notifications and claims + sends each one via a per-order conditional
   * UPDATE. affected_rows = 1 means this call won the claim (no other concurrent replica or
   * overlapping tick got there first) and is responsible for sending; affected_rows = 0 means
   * someone else already claimed it, so it's skipped. This is what makes "exactly one
   * notification per order" hold even with multiple replicas running the same cron tick.
   */
  async scanAndSendPending(): Promise<{ scanned: number; sent: number }> {
    const pending: Array<{ order_id: string }> = await this.notificationsRepository.manager.query(
      `SELECT order_id FROM notifications WHERE status = 'PENDING' LIMIT ?`,
      [SCAN_BATCH_SIZE],
    );

    let sent = 0;
    for (const row of pending) {
      const claimed = await this.claimAndSend(row.order_id);
      if (claimed) sent++;
    }

    return { scanned: pending.length, sent };
  }

  private async claimAndSend(orderId: string): Promise<boolean> {
    const result = await this.notificationsRepository.manager.query(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW(3) WHERE order_id = ? AND status = 'PENDING'`,
      [orderId],
    );
    const affectedRows: number = result?.affectedRows ?? 0;
    if (affectedRows === 1) {
      this.send(orderId);
      return true;
    }
    return false;
  }

  /** "Sending a notification" for this assignment is recording that one was sent - the
   * sent_at column set above is that record. This log line is the visible side effect. */
  private send(orderId: string): void {
    this.logger.log(`Notification sent for shipped order ${orderId}`);
  }
}
