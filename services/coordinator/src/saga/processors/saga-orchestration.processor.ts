import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_SAGA_ORCHESTRATION } from '@order-system/shared-types';
import { SagaService } from '../saga.service';

@Processor(QUEUE_SAGA_ORCHESTRATION)
export class SagaOrchestrationProcessor extends WorkerHost {
  constructor(private readonly sagaService: SagaService) {
    super();
  }

  async process(job: Job<{ orderId: string }>): Promise<void> {
    await this.sagaService.prepareAndEnqueueDoSteps(job.data.orderId);
  }
}
