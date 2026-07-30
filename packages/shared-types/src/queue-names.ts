export const QUEUE_SAGA_ORCHESTRATION = 'saga-orchestration';
export const QUEUE_SAGA_STEP_DO = 'saga-step-do';
export const QUEUE_SAGA_STEP_UNDO = 'saga-step-undo';
export const QUEUE_CSV_INGEST = 'csv-ingest';
export const QUEUE_NOTIFICATION_CRON = 'notification-cron';

export const JOB_RUN_SAGA = 'run-saga';
export const JOB_SCAN_SHIPPED_ORDERS = 'scan-shipped-orders';

// BullMQ rejects custom job IDs containing ':', so use '|' as the separator.
export function doJobId(orderId: string, stepName: string): string {
  return `do|${orderId}|${stepName}`;
}

export function undoJobId(orderId: string, stepName: string): string {
  return `undo|${orderId}|${stepName}`;
}

export function runSagaJobId(orderId: string): string {
  return `run-saga|${orderId}`;
}
