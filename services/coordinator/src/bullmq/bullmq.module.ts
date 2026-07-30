import { DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

/** Called exactly once, from AppModule - @nestjs/bullmq's convention is forRoot() once at
 * the app root, with each feature module calling only BullModule.registerQueue() for the
 * specific queues it needs, all sharing this one Redis connection config. */
export function BullMQRootModule(): DynamicModule {
  return BullModule.forRoot({
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    },
  });
}
