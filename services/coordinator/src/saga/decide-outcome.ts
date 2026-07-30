import { StepName, StepStatus } from '@order-system/shared-types';

export interface StepStatusRow {
  stepName: StepName;
  status: StepStatus;
}

export type DoDecision =
  | { kind: 'PLACED' }
  | { kind: 'CANCELLED_NO_COMPENSATION_NEEDED' }
  | { kind: 'COMPENSATE'; stepsToUndo: StepName[] };

/**
 * Pure decision function for the DO-phase fan-in: given every DO step's final status for a
 * saga, decides whether the order is Placed, or - on any failure - which of the steps that
 * actually completed need to be undone. Kept separate from saga.service.ts's DB/queue side
 * effects so this can be unit tested with plain fixture arrays instead of a real database.
 */
export function decideDoOutcome(steps: StepStatusRow[]): DoDecision {
  const allDone = steps.every((s) => s.status === StepStatus.DONE);
  if (allDone) return { kind: 'PLACED' };

  const doneSteps = steps.filter((s) => s.status === StepStatus.DONE).map((s) => s.stepName);
  if (doneSteps.length === 0) return { kind: 'CANCELLED_NO_COMPENSATION_NEEDED' };

  return { kind: 'COMPENSATE', stepsToUndo: doneSteps };
}

export type CompensationDecision = 'CANCELLED' | 'NEEDS_ATTENTION';

/** Pure decision function for the UNDO-phase fan-in: Cancelled only if every undo step that
 * was attempted actually succeeded; otherwise Needs-attention. */
export function decideCompensationOutcome(undoSteps: StepStatusRow[]): CompensationDecision {
  const allDone = undoSteps.every((s) => s.status === StepStatus.DONE);
  return allDone ? 'CANCELLED' : 'NEEDS_ATTENTION';
}
