import { StepName } from '../step-names';

/** Request body coordinator sends to a step service's POST /do */
export interface DoRequestDto {
  orderId: string;
  stepName: StepName;
  sku: string;
  qty: number;
  amount: number;
  /** value of the saga's fail_at column, or null; step services only act on it if it equals their own step name */
  failAt: string | null;
  /** value of the saga's comp_fail_at column, or null; persisted now so the later /undo call can read it back from the service's own storage instead of trusting a caller-supplied value at undo time */
  compFailAt: string | null;
}
