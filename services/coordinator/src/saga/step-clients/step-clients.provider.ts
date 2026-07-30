import { Provider } from '@nestjs/common';
import { StepName } from '@order-system/shared-types';
import { StepClient } from './step-client';
import { STEP_HTTP_TIMEOUT_MS } from '../bullmq-job-options';

export const STEP_CLIENTS = 'STEP_CLIENTS';

export type StepClients = Record<StepName, StepClient>;

export const stepClientsProvider: Provider = {
  provide: STEP_CLIENTS,
  useFactory: (): StepClients => ({
    [StepName.CREATE_ORDER]: new StepClient(
      process.env.ORDER_SERVICE_URL || 'http://localhost:3001',
      STEP_HTTP_TIMEOUT_MS,
    ),
    [StepName.RESERVE_INVENTORY]: new StepClient(
      process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002',
      STEP_HTTP_TIMEOUT_MS,
    ),
    [StepName.CHARGE_PAYMENT]: new StepClient(
      process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003',
      STEP_HTTP_TIMEOUT_MS,
    ),
    [StepName.CREATE_SHIPMENT]: new StepClient(
      process.env.SHIPPING_SERVICE_URL || 'http://localhost:3004',
      STEP_HTTP_TIMEOUT_MS,
    ),
  }),
};
