import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  JOB_RUN_SAGA,
  Phase,
  QUEUE_SAGA_ORCHESTRATION,
  QUEUE_SAGA_STEP_DO,
  QUEUE_SAGA_STEP_UNDO,
  SagaStatus,
  StepStatus,
  doJobId,
  runSagaJobId,
  undoJobId,
} from '@order-system/shared-types';
import { SagaEntity } from './entities/saga.entity';
import { SagaStepEntity } from './entities/saga-step.entity';
import { SagaService } from './saga.service';
import { ORCHESTRATION_JOB_OPTIONS, STEP_JOB_OPTIONS } from './bullmq-job-options';

/** Older than this and a RUNNING step is treated as orphaned (the worker that claimed it
 * crashed mid-call) rather than legitimately still in-flight. Comfortably past the worst
 * case of STEP_HTTP_TIMEOUT_MS(5s) x 4 attempts x 2s backoff =~ 28s. */
const STALE_RUNNING_THRESHOLD_MS = 2 * 60 * 1000;

@Injectable()
export class ReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(SagaEntity)
    private readonly sagasRepository: Repository<SagaEntity>,
    @InjectRepository(SagaStepEntity)
    private readonly sagaStepsRepository: Repository<SagaStepEntity>,
    private readonly sagaService: SagaService,
    @InjectQueue(QUEUE_SAGA_ORCHESTRATION)
    private readonly orchestrationQueue: Queue,
    @InjectQueue(QUEUE_SAGA_STEP_DO)
    private readonly doQueue: Queue,
    @InjectQueue(QUEUE_SAGA_STEP_UNDO)
    private readonly undoQueue: Queue,
  ) {}

  /**
   * Runs once at boot. Every action taken here (jobId-deduped enqueue, conditional UPDATE)
   * is already idempotent, so this is safe to run redundantly if multiple coordinator
   * replicas boot at the same time - no distributed lock is needed.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const inProgressSagas = await this.sagasRepository.find({ where: { status: SagaStatus.IN_PROGRESS } });
    this.logger.log(`Reconciliation: found ${inProgressSagas.length} in-progress saga(s) to check`);

    for (const saga of inProgressSagas) {
      try {
        await this.reconcileOne(saga.orderId);
      } catch (err) {
        this.logger.error(`Reconciliation failed for order ${saga.orderId}`, err instanceof Error ? err.stack : err);
      }
    }
  }

  private async reconcileOne(orderId: string): Promise<void> {
    const steps = await this.sagaStepsRepository.find({ where: { orderId }, order: { id: 'ASC' } });
    const doSteps = steps.filter((s) => s.phase === Phase.DO);
    const undoSteps = steps.filter((s) => s.phase === Phase.UNDO);

    if (doSteps.length === 0) {
      // crashed before the DO steps were even created/enqueued - restart the whole saga
      await this.orchestrationQueue.add(
        JOB_RUN_SAGA,
        { orderId },
        { ...ORCHESTRATION_JOB_OPTIONS, jobId: runSagaJobId(orderId) },
      );
      return;
    }

    const doSettled = await this.reconcileStepGroup(orderId, doSteps, this.doQueue, doJobId);
    if (!doSettled) return;

    if (undoSteps.length === 0) {
      // all DO steps are settled but the saga is still IN_PROGRESS: the crash happened
      // right at the fan-in decision point - safe to just re-run it
      await this.sagaService.decideAndAdvance(orderId);
      return;
    }

    const undoSettled = await this.reconcileStepGroup(orderId, undoSteps, this.undoQueue, undoJobId);
    if (undoSettled) {
      await this.sagaService.decideCompensationOutcome(orderId);
    }
  }

  /** Re-enqueues any not-yet-settled step in the group (PENDING, or RUNNING past the
   * staleness threshold), and reports whether every step in the group is now settled
   * (DONE/FAILED) with nothing outstanding. */
  private async reconcileStepGroup(
    orderId: string,
    stepGroup: SagaStepEntity[],
    queue: Queue,
    jobIdFn: (orderId: string, stepName: string) => string,
  ): Promise<boolean> {
    let allSettled = true;

    for (const step of stepGroup) {
      if (step.status === StepStatus.DONE || step.status === StepStatus.FAILED) {
        continue;
      }

      if (step.status === StepStatus.PENDING) {
        allSettled = false;
        await queue.add(
          step.stepName,
          { orderId, stepName: step.stepName },
          { ...STEP_JOB_OPTIONS, jobId: jobIdFn(orderId, step.stepName) },
        );
        continue;
      }

      // RUNNING
      allSettled = false;
      const startedAtMs = step.startedAt ? new Date(step.startedAt).getTime() : 0;
      const isStale = Date.now() - startedAtMs > STALE_RUNNING_THRESHOLD_MS;
      if (isStale) {
        await this.sagaStepsRepository.manager.query(
          `UPDATE saga_steps SET status = 'PENDING' WHERE order_id = ? AND step_name = ? AND phase = ? AND status = 'RUNNING'`,
          [orderId, step.stepName, step.phase],
        );
        await queue.add(
          step.stepName,
          { orderId, stepName: step.stepName },
          { ...STEP_JOB_OPTIONS, jobId: jobIdFn(orderId, step.stepName) },
        );
      }
      // else: young enough that a live worker is plausibly still processing it - leave alone
    }

    return allSettled;
  }
}
