import { StepName } from '../step-names';

/** Request body coordinator sends to a step service's POST /undo. No compFailAt here by
 * design: the step service reads back the comp_fail_at it stored at do-time from its own
 * data instead of trusting a caller-supplied value at undo time. */
export interface UndoRequestDto {
  orderId: string;
  stepName: StepName;
}
