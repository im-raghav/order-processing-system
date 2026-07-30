import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_SCAN_SHIPPED_ORDERS, QUEUE_NOTIFICATION_CRON } from '@order-system/shared-types';

const DEFAULT_SCAN_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes, per the spec
const REPEAT_JOB_ID = 'scan-shipped-orders-repeat';

/**
 * Registers the repeatable scan job at boot. BullMQ de-dupes repeatable job registration by
 * its repeat config, so every replica registering this at startup does not create multiple
 * schedules - only one repeatable job ends up running per (name, repeat-options) pair,
 * though the real exactly-once guarantee is NotificationsService's claim-and-send, not this.
 */
@Injectable()
export class NotificationCronSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationCronSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NOTIFICATION_CRON)
    private readonly cronQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const every = process.env.NOTIFICATION_SCAN_INTERVAL_MS
      ? parseInt(process.env.NOTIFICATION_SCAN_INTERVAL_MS, 10)
      : DEFAULT_SCAN_INTERVAL_MS;

    await this.cronQueue.add(
      JOB_SCAN_SHIPPED_ORDERS,
      {},
      { repeat: { every }, jobId: REPEAT_JOB_ID },
    );

    this.logger.log(`Registered shipped-orders scan every ${every}ms`);
  }
}
