/** The comp_fail_at column names the compensating (undo) action, not the forward step -
 * e.g. payment-service's undo of CHARGE_PAYMENT is REFUND_PAYMENT, and that's the string
 * that appears in orders_bulk.csv's comp_fail_at column, distinct from StepName. */
export enum CompStepName {
  CANCEL_ORDER = 'CANCEL_ORDER',
  RELEASE_INVENTORY = 'RELEASE_INVENTORY',
  REFUND_PAYMENT = 'REFUND_PAYMENT',
  CANCEL_SHIPMENT = 'CANCEL_SHIPMENT',
}
