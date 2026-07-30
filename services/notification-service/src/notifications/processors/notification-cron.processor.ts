import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NOTIFICATION_CRON } from '@order-system/shared-types';
import { NotificationsService } from '../notifications.service';

@Processor(QUEUE_NOTIFICATION_CRON)
export class NotificationCronProcessor extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(): Promise<void> {
    await this.notificationsService.scanAndSendPending();
  }
}
