import { JobsOptions } from 'bullmq';

/** "a few more times" with "a short wait between tries" per the spec. */
export const STEP_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'fixed', delay: 2000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: false,
};

/** The orchestration job itself isn't retried by BullMQ - re-running a saga after a crash
 * is reconciliation's job (added later), and re-adding children on a BullMQ-level retry of
 * this job would risk double-enqueueing them, so attempts is pinned to 1. */
export const ORCHESTRATION_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { age: 3600 },
  removeOnFail: false,
};

/** Wraps each HTTP call to a step service; a timeout here is what makes "runs longer than
 * the time limit" count as a failed attempt for BullMQ's retry accounting. */
export const STEP_HTTP_TIMEOUT_MS = 5000;

export const STEP_WORKER_CONCURRENCY = process.env.STEP_WORKER_CONCURRENCY
  ? parseInt(process.env.STEP_WORKER_CONCURRENCY, 10)
  : 20;
