import { StepName, StepStatus } from '@order-system/shared-types';
import { decideCompensationOutcome, decideDoOutcome, StepStatusRow } from './decide-outcome';

function step(stepName: StepName, status: StepStatus): StepStatusRow {
  return { stepName, status };
}

describe('decideDoOutcome', () => {
  it('decides PLACED when every DO step is DONE', () => {
    const steps = [
      step(StepName.CREATE_ORDER, StepStatus.DONE),
      step(StepName.RESERVE_INVENTORY, StepStatus.DONE),
      step(StepName.CHARGE_PAYMENT, StepStatus.DONE),
      step(StepName.CREATE_SHIPMENT, StepStatus.DONE),
    ];
    expect(decideDoOutcome(steps)).toEqual({ kind: 'PLACED' });
  });

  it('decides COMPENSATE with only the completed steps when one step fails', () => {
    const steps = [
      step(StepName.CREATE_ORDER, StepStatus.DONE),
      step(StepName.RESERVE_INVENTORY, StepStatus.DONE),
      step(StepName.CHARGE_PAYMENT, StepStatus.FAILED),
      step(StepName.CREATE_SHIPMENT, StepStatus.DONE),
    ];
    expect(decideDoOutcome(steps)).toEqual({
      kind: 'COMPENSATE',
      stepsToUndo: [StepName.CREATE_ORDER, StepName.RESERVE_INVENTORY, StepName.CREATE_SHIPMENT],
    });
  });

  it('decides CANCELLED_NO_COMPENSATION_NEEDED when nothing completed', () => {
    const steps = [
      step(StepName.CREATE_ORDER, StepStatus.FAILED),
      step(StepName.RESERVE_INVENTORY, StepStatus.FAILED),
      step(StepName.CHARGE_PAYMENT, StepStatus.FAILED),
      step(StepName.CREATE_SHIPMENT, StepStatus.FAILED),
    ];
    expect(decideDoOutcome(steps)).toEqual({ kind: 'CANCELLED_NO_COMPENSATION_NEEDED' });
  });
});

describe('decideCompensationOutcome', () => {
  it('decides CANCELLED when every undo step succeeded', () => {
    const steps = [step(StepName.CREATE_ORDER, StepStatus.DONE), step(StepName.RESERVE_INVENTORY, StepStatus.DONE)];
    expect(decideCompensationOutcome(steps)).toBe('CANCELLED');
  });

  it('decides NEEDS_ATTENTION when any undo step failed after exhausting retries', () => {
    const steps = [step(StepName.CREATE_ORDER, StepStatus.DONE), step(StepName.RESERVE_INVENTORY, StepStatus.FAILED)];
    expect(decideCompensationOutcome(steps)).toBe('NEEDS_ATTENTION');
  });
});
