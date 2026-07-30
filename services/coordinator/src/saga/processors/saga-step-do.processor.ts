import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_SAGA_STEP_DO, StepName } from '@order-system/shared-types';
import { SagaService } from '../saga.service';
import { STEP_WORKER_CONCURRENCY } from '../bullmq-job-options';

@Processor(QUEUE_SAGA_STEP_DO, { concurrency: STEP_WORKER_CONCURRENCY })
export class SagaStepDoProcessor extends WorkerHost {
  constructor(private readonly sagaService: SagaService) {
    super();
  }

  async process(job: Job<{ orderId: string; stepName: StepName }>): Promise<void> {
    const attemptNumber = (job.attemptsMade ?? 0) + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    await this.sagaService.processDoStepAttempt(job.data.orderId, job.data.stepName, attemptNumber, maxAttempts);
  }
}
