import { StepName } from '../step-names';
import { StepOutcome } from './step-outcome';

/** Response body a step service returns from POST /do or POST /undo */
export interface StepResultDto {
  orderId: string;
  step: StepName;
  outcome: StepOutcome;
  /** true if this call was an idempotent replay of an already-settled action, not a fresh execution */
  alreadyDone: boolean;
  reason?: string;
}
