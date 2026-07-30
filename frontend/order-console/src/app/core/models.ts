export type SagaStatus = 'IN_PROGRESS' | 'PLACED' | 'SHIPPED' | 'CANCELLED' | 'NEEDS_ATTENTION';
export type StepName = 'CREATE_ORDER' | 'RESERVE_INVENTORY' | 'CHARGE_PAYMENT' | 'CREATE_SHIPMENT';
export type Phase = 'DO' | 'UNDO';
export type StepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface StepSummary {
  stepName: StepName;
  phase: Phase;
  status: StepStatus;
}

export interface OrderSummary {
  orderId: string;
  status: SagaStatus;
  sku: string;
  qty: number;
  amount: string;
  createdAt: string;
  updatedAt: string;
  steps: StepSummary[];
}

export interface OrderListResponse {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SagaStepDetail {
  id: number;
  orderId: string;
  stepName: StepName;
  phase: Phase;
  status: StepStatus;
  attempts: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface OrderDetail {
  orderId: string;
  status: SagaStatus;
  sku: string;
  qty: number;
  amount: string;
  failAt: string | null;
  compFailAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: SagaStepDetail[];
}

export interface IngestProgress {
  rowsRead: number;
  rowsInserted: number;
  rowsSkippedDuplicate: number;
  done: boolean;
  error?: string;
}
