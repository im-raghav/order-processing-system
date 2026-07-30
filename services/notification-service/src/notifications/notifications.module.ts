import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NOTIFICATION_CRON } from '@order-system/shared-types';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationCronProcessor } from './processors/notification-cron.processor';
import { NotificationCronSchedulerService } from './notification-cron-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
      },
    }),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATION_CRON }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationCronProcessor, NotificationCronSchedulerService],
})
export class NotificationsModule {}
