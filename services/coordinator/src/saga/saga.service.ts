import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import {
  ALL_STEP_NAMES,
  Phase,
  QUEUE_SAGA_ORCHESTRATION,
  QUEUE_SAGA_STEP_DO,
  QUEUE_SAGA_STEP_UNDO,
  SagaStatus,
  StepName,
  StepOutcome,
  StepResultDto,
  StepStatus,
  doJobId,
  runSagaJobId,
  undoJobId,
  JOB_RUN_SAGA,
} from '@order-system/shared-types';
import { SagaEntity } from './entities/saga.entity';
import { SagaStepEntity } from './entities/saga-step.entity';
import { CreateSagaDto } from './dto/create-saga.dto';
import { STEP_CLIENTS, StepClients } from './step-clients/step-clients.provider';
import { STEP_JOB_OPTIONS, ORCHESTRATION_JOB_OPTIONS } from './bullmq-job-options';
import { NotificationPusherService } from './notification-pusher.service';
import { decideDoOutcome, decideCompensationOutcome as decideCompensationOutcomePure } from './decide-outcome';

@Injectable()
export class SagaService {
  constructor(
    @InjectRepository(SagaEntity)
    private readonly sagasRepository: Repository<SagaEntity>,
    @InjectRepository(SagaStepEntity)
    private readonly sagaStepsRepository: Repository<SagaStepEntity>,
    @Inject(STEP_CLIENTS)
    private readonly stepClients: StepClients,
    @InjectQueue(QUEUE_SAGA_ORCHESTRATION)
    private readonly orchestrationQueue: Queue,
    @InjectQueue(QUEUE_SAGA_STEP_DO)
    private readonly doQueue: Queue,
    @InjectQueue(QUEUE_SAGA_STEP_UNDO)
    private readonly undoQueue: Queue,
    private readonly notificationPusher: NotificationPusherService,
  ) {}

  /**
   * Idempotent saga creation: a no-op INSERT on a duplicate order_id, so re-submitting the
   * same order (e.g. re-uploading the same CSV row later) never starts a second saga. The
   * orchestration job's jobId is deterministic too, so even a duplicate enqueue is a no-op.
   */
  async createAndRunSaga(dto: CreateSagaDto): Promise<void> {
    await this.sagasRepository.manager.query(
      `INSERT INTO sagas (order_id, sku, qty, amount, fail_at, comp_fail_at, status, pending_do_count, pending_undo_count)
       VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 4, 0)
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      [dto.orderId, dto.sku, dto.qty, dto.amount, dto.failAt ?? null, dto.compFailAt ?? null],
    );

    await this.orchestrationQueue.add(
      JOB_RUN_SAGA,
      { orderId: dto.orderId },
      { ...ORCHESTRATION_JOB_OPTIONS, jobId: runSagaJobId(dto.orderId) },
    );
  }

  /**
   * Runs in the saga-orchestration worker: ensures the 4 DO step rows exist, then fans out
   * one saga-step-do job per step with a deterministic jobId. This is the only place a
   * saga's DO steps are enqueued, whether triggered fresh or re-triggered by crash recovery.
   */
  async prepareAndEnqueueDoSteps(orderId: string): Promise<void> {
    const saga = await this.sagasRepository.findOneBy({ orderId });
    if (!saga || saga.status !== SagaStatus.IN_PROGRESS) return;

    for (const stepName of ALL_STEP_NAMES) {
      await this.sagaStepsRepository.manager.query(
        `INSERT INTO saga_steps (order_id, step_name, phase, status)
         VALUES (?, ?, 'DO', 'PENDING')
         ON DUPLICATE KEY UPDATE order_id = order_id`,
        [orderId, stepName],
      );
    }

    for (const stepName of ALL_STEP_NAMES) {
      await this.doQueue.add(
        stepName,
        { orderId, stepName },
        { ...STEP_JOB_OPTIONS, jobId: doJobId(orderId, stepName) },
      );
    }
  }

  /**
   * Runs in the saga-step-do worker, once per BullMQ job attempt. Claims the step (or skips
   * if it's already settled by an earlier/duplicate attempt), makes exactly one HTTP call
   * attempt, and either records a terminal DONE/FAILED result or - on a transport error with
   * attempts remaining - rethrows so BullMQ's own backoff/retry drives the next attempt.
   */
  async processDoStepAttempt(orderId: string, stepName: StepName, attemptNumber: number, maxAttempts: number): Promise<void> {
    const claim = await this.claimOrSkip(orderId, stepName, Phase.DO);
    if (claim === 'skip') return;

    const saga = await this.sagasRepository.findOneByOrFail({ orderId });
    const client = this.stepClients[stepName];

    let result: StepResultDto;
    try {
      result = await client.do({
        orderId,
        stepName,
        sku: saga.sku,
        qty: saga.qty,
        amount: Number(saga.amount),
        failAt: saga.failAt,
        compFailAt: saga.compFailAt,
      });
    } catch (err) {
      await this.handleTransportError(orderId, stepName, Phase.DO, attemptNumber, maxAttempts, err);
      return;
    }

    await this.recordStepResult(orderId, stepName, Phase.DO, attemptNumber, result);
    await this.onDoStepSettled(orderId);
  }

  /** Mirror of processDoStepAttempt for the UNDO phase - see that method for the rationale. */
  async processUndoStepAttempt(orderId: string, stepName: StepName, attemptNumber: number, maxAttempts: number): Promise<void> {
    const claim = await this.claimOrSkip(orderId, stepName, Phase.UNDO);
    if (claim === 'skip') return;

    const client = this.stepClients[stepName];

    let result: StepResultDto;
    try {
      result = await client.undo({ orderId, stepName });
    } catch (err) {
      await this.handleTransportError(orderId, stepName, Phase.UNDO, attemptNumber, maxAttempts, err);
      return;
    }

    await this.recordStepResult(orderId, stepName, Phase.UNDO, attemptNumber, result);
    await this.onUndoStepSettled(orderId);
  }

  /**
   * A step row is claimable from PENDING (never attempted) or FAILED (a manual retry, e.g.
   * retry-compensation, made it claimable again). If neither, and the row is already DONE,
   * this is a stale/duplicate delivery of a step that's already finished - skip entirely
   * rather than re-running the side effect. Any other state (RUNNING) means this is a later
   * attempt of the same BullMQ job that already claimed it - proceed without re-claiming.
   */
  private async claimOrSkip(orderId: string, stepName: StepName, phase: Phase): Promise<'proceed' | 'skip'> {
    const claimResult = await this.sagaStepsRepository.manager.query(
      `UPDATE saga_steps SET status = 'RUNNING', started_at = NOW(3)
       WHERE order_id = ? AND step_name = ? AND phase = ? AND status IN ('PENDING','FAILED')`,
      [orderId, stepName, phase],
    );
    if ((claimResult?.affectedRows ?? 0) > 0) return 'proceed';

    const [row] = await this.sagaStepsRepository.manager.query(
      `SELECT status FROM saga_steps WHERE order_id = ? AND step_name = ? AND phase = ?`,
      [orderId, stepName, phase],
    );
    return row?.status === StepStatus.DONE ? 'skip' : 'proceed';
  }

  private async handleTransportError(
    orderId: string,
    stepName: StepName,
    phase: Phase,
    attemptNumber: number,
    maxAttempts: number,
    err: unknown,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const isFinalAttempt = attemptNumber >= maxAttempts;

    if (!isFinalAttempt) {
      // record progress but leave status as RUNNING; rethrowing below lets BullMQ retry with backoff
      await this.sagaStepsRepository.manager.query(
        `UPDATE saga_steps SET attempts = ?, last_error = ? WHERE order_id = ? AND step_name = ? AND phase = ?`,
        [attemptNumber, message, orderId, stepName, phase],
      );
    } else {
      await this.sagaStepsRepository.manager.query(
        `UPDATE saga_steps SET status = 'FAILED', attempts = ?, last_error = ?, finished_at = NOW(3)
         WHERE order_id = ? AND step_name = ? AND phase = ?`,
        [attemptNumber, message, orderId, stepName, phase],
      );
      if (phase === Phase.DO) await this.onDoStepSettled(orderId);
      else await this.onUndoStepSettled(orderId);
    }

    // always rethrow: BullMQ's own attempts/backoff config decides whether this triggers
    // another delivery or finally marks the job 'failed' (kept around per removeOnFail:false)
    throw err;
  }

  private async recordStepResult(
    orderId: string,
    stepName: StepName,
    phase: Phase,
    attemptNumber: number,
    result: StepResultDto,
  ): Promise<void> {
    const status = result.outcome === StepOutcome.SUCCESS ? StepStatus.DONE : StepStatus.FAILED;
    const errorText = result.outcome === StepOutcome.FAILURE ? (result.reason ?? 'FAILURE') : null;
    await this.sagaStepsRepository.manager.query(
      `UPDATE saga_steps SET status = ?, attempts = ?, last_error = ?, finished_at = NOW(3)
       WHERE order_id = ? AND step_name = ? AND phase = ?`,
      [status, attemptNumber, errorText, orderId, stepName, phase],
    );
  }

  /**
   * Atomically decrements pending_do_count and reports whether THIS call brought it to zero.
   * The decrement and the read happen inside one transaction, so the row lock the UPDATE
   * takes is held until the SELECT completes - that's what guarantees exactly one caller
   * (across any number of coordinator replicas) ever observes zero for a given saga.
   */
  private async decrementAndCheckLastArriver(orderId: string, column: 'pending_do_count' | 'pending_undo_count'): Promise<boolean> {
    return this.sagasRepository.manager.transaction(async (manager) => {
      await manager.query(`UPDATE sagas SET ${column} = ${column} - 1 WHERE order_id = ?`, [orderId]);
      const [row] = await manager.query(`SELECT ${column} as remaining FROM sagas WHERE order_id = ?`, [orderId]);
      return row?.remaining === 0;
    });
  }

  private async onDoStepSettled(orderId: string): Promise<void> {
    const isLastArriver = await this.decrementAndCheckLastArriver(orderId, 'pending_do_count');
    if (isLastArriver) await this.decideAndAdvance(orderId);
  }

  private async onUndoStepSettled(orderId: string): Promise<void> {
    const isLastArriver = await this.decrementAndCheckLastArriver(orderId, 'pending_undo_count');
    if (isLastArriver) await this.decideCompensationOutcome(orderId);
  }

  /** Runs once, in the last DO step's worker: decides Placed, or triggers compensation.
   * Also called directly by ReconciliationService when a restart finds every DO step
   * already settled but the saga still IN_PROGRESS (the crash happened right at this
   * decision point) - safe to re-run since every write here is itself idempotent. */
  async decideAndAdvance(orderId: string): Promise<void> {
    const doSteps = await this.sagaStepsRepository.find({ where: { orderId, phase: Phase.DO } });
    const decision = decideDoOutcome(doSteps);

    if (decision.kind === 'PLACED') {
      await this.sagasRepository.manager.query(
        `UPDATE sagas SET status = 'PLACED' WHERE order_id = ? AND status = 'IN_PROGRESS'`,
        [orderId],
      );
      return;
    }

    if (decision.kind === 'CANCELLED_NO_COMPENSATION_NEEDED') {
      await this.sagasRepository.manager.query(
        `UPDATE sagas SET status = 'CANCELLED' WHERE order_id = ? AND status = 'IN_PROGRESS'`,
        [orderId],
      );
      return;
    }

    for (const stepName of decision.stepsToUndo) {
      await this.sagaStepsRepository.manager.query(
        `INSERT INTO saga_steps (order_id, step_name, phase, status)
         VALUES (?, ?, 'UNDO', 'PENDING')
         ON DUPLICATE KEY UPDATE order_id = order_id`,
        [orderId, stepName],
      );
    }

    // set the undo fan-in counter before enqueueing, so the first undo worker to finish
    // (which could be near-instant) never observes a stale/unset value
    await this.sagasRepository.manager.query(`UPDATE sagas SET pending_undo_count = ? WHERE order_id = ?`, [
      decision.stepsToUndo.length,
      orderId,
    ]);

    for (const stepName of decision.stepsToUndo) {
      await this.undoQueue.add(
        stepName,
        { orderId, stepName },
        { ...STEP_JOB_OPTIONS, jobId: undoJobId(orderId, stepName) },
      );
    }
  }

  /** Runs once, in the last UNDO step's worker (or directly if there was nothing to undo).
   * Also called by ReconciliationService when a restart finds every UNDO step settled but
   * the saga still IN_PROGRESS. */
  async decideCompensationOutcome(orderId: string): Promise<void> {
    const undoSteps = await this.sagaStepsRepository.find({ where: { orderId, phase: Phase.UNDO } });
    const decision = decideCompensationOutcomePure(undoSteps);

    await this.sagasRepository.manager.query(
      `UPDATE sagas SET status = ? WHERE order_id = ? AND status = 'IN_PROGRESS'`,
      [decision === 'CANCELLED' ? SagaStatus.CANCELLED : SagaStatus.NEEDS_ATTENTION, orderId],
    );
  }

  /**
   * Re-runs only the undo steps still FAILED for a Needs-attention order. Existing BullMQ
   * jobs for those steps are already in a terminal 'failed' state, so re-adding with the
   * same jobId would be a no-op (BullMQ ignores add() for a jobId that still exists) -
   * instead the existing job is looked up and explicitly retried.
   */
  async retryCompensation(orderId: string): Promise<void> {
    const saga = await this.sagasRepository.findOneBy({ orderId });
    if (!saga || saga.status !== SagaStatus.NEEDS_ATTENTION) {
      throw new NotFoundException(`Order ${orderId} is not in NEEDS_ATTENTION state`);
    }

    const failedUndoSteps = await this.sagaStepsRepository.find({
      where: { orderId, phase: Phase.UNDO, status: StepStatus.FAILED },
    });
    if (failedUndoSteps.length === 0) return;

    await this.sagasRepository.manager.query(`UPDATE sagas SET pending_undo_count = ? WHERE order_id = ?`, [
      failedUndoSteps.length,
      orderId,
    ]);

    for (const s of failedUndoSteps) {
      const jobId = undoJobId(orderId, s.stepName);
      const existingJob = await this.undoQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.retry('failed');
      } else {
        await this.undoQueue.add(s.stepName, { orderId, stepName: s.stepName }, { ...STEP_JOB_OPTIONS, jobId });
      }
    }
  }

  async markShipped(orderId: string): Promise<void> {
    const result = await this.sagasRepository.manager.query(
      `UPDATE sagas SET status = 'SHIPPED' WHERE order_id = ? AND status = 'PLACED'`,
      [orderId],
    );
    if ((result?.affectedRows ?? 0) === 0) {
      throw new ConflictException(`Order ${orderId} is not in PLACED state`);
    }

    await this.notificationPusher.pushOrderShipped(orderId, new Date());
  }

  async listSagas(status: SagaStatus | undefined, page: number, pageSize: number) {
    const qb = this.sagasRepository.createQueryBuilder('s');
    if (status) qb.where('s.status = :status', { status });
    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const orderIds = items.map((i) => i.orderId);
    const steps = orderIds.length
      ? await this.sagaStepsRepository.find({ where: { orderId: In(orderIds) } })
      : [];
    const stepsByOrder = new Map<string, SagaStepEntity[]>();
    for (const step of steps) {
      const list = stepsByOrder.get(step.orderId) ?? [];
      list.push(step);
      stepsByOrder.set(step.orderId, list);
    }

    return {
      items: items.map((s) => ({
        orderId: s.orderId,
        status: s.status,
        sku: s.sku,
        qty: s.qty,
        amount: s.amount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        steps: (stepsByOrder.get(s.orderId) ?? []).map((st) => ({
          stepName: st.stepName,
          phase: st.phase,
          status: st.status,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getSagaDetail(orderId: string) {
    const saga = await this.sagasRepository.findOneBy({ orderId });
    if (!saga) throw new NotFoundException(`Order ${orderId} not found`);
    const steps = await this.sagaStepsRepository.find({ where: { orderId }, order: { id: 'ASC' } });
    return { ...saga, steps };
  }
}
