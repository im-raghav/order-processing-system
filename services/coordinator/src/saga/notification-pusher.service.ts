import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Pushes a "this order shipped" fact to notification-service the moment mark-shipped
 * commits (see saga.service.ts markShipped). A small retry covers transient blips; if it
 * still fails, mark-shipped has already succeeded (that's coordinator-owned truth) and this
 * push failure is only logged - notification-service simply won't have a PENDING row to
 * notify on, which is called out as a known gap in the run guide rather than retried forever
 * here, since coordinator does not own notification-service's data.
 */
@Injectable()
export class NotificationPusherService {
  private readonly logger = new Logger(NotificationPusherService.name);

  async pushOrderShipped(orderId: string, shippedAt: Date): Promise<void> {
    const baseURL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await axios.post(`${baseURL}/internal/orders-shipped`, {
          orderId,
          shippedAt: shippedAt.toISOString(),
        });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === RETRY_ATTEMPTS) {
          this.logger.error(`Failed to push shipped event for order ${orderId} after ${RETRY_ATTEMPTS} attempts: ${message}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}
