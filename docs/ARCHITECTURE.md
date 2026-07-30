# Architecture

## Overview

A **coordinator** orchestrates four independent step services per order, in parallel:

| Step | Service | Do | Undo |
|---|---|---|---|
| Order | order-service | Create the order | Cancel the order |
| Stock | inventory-service | Reserve the items | Release the items |
| Payment | payment-service | Charge the customer | Refund the customer |
| Shipping | shipping-service | Arrange the shipment | Cancel the shipment |

If all four succeed, the order is **Placed**. If any step fails, the coordinator undoes
only the steps that actually completed, and the order ends **Cancelled**. If an undo keeps
failing, the order is marked **Needs attention** for a manual retry. A separate
**notification-service** sends exactly one notification per order marked **Shipped**, via a
recurring scan - it is not part of the saga.

Each service owns its own MySQL database; they only ever talk to each other over HTTP.

## The saga state machine

The coordinator's `sagas` table holds one row per order (`status`, plus `fail_at`/
`comp_fail_at` carried over from the CSV for demoing failure paths) and a `saga_steps`
table holds one row per `(order_id, step_name, phase)` - this is both the coordinator's
idempotency ledger and the audit trail the order detail page renders.

**Idempotency** is enforced at two layers:
- Each step service's own table has `order_id` as its primary key; handling `/do` is an
  "insert-or-return" (`INSERT ... ON DUPLICATE KEY UPDATE order_id = order_id`) so a
  retried or duplicate call never repeats the real side effect (charge, stock decrement,
  etc.) - whichever call happens first permanently decides the outcome.
- The coordinator's own `saga_steps.status` only allows a worker to claim a step from
  `PENDING`/`FAILED` into `RUNNING` via a conditional `UPDATE`; a stale/duplicate delivery
  that finds the step already `DONE` is skipped entirely.

**Fan-out/fan-in** is a counter column (`pending_do_count`, `pending_undo_count`) on the
`sagas` row, decremented inside a transaction by whichever step-worker finishes last -
the transaction's row lock is what guarantees exactly one worker ever observes the counter
hit zero, across any number of coordinator replicas. This was chosen over a BullMQ Flow
because the join must be re-derivable purely from durable MySQL state after a crash (Redis
is queue/cache only here, never a source of truth), and race-free across replicas without
extra coordination.

**Retries** are BullMQ's job `attempts`/`backoff` (4 attempts, 2s fixed delay) wrapping each
HTTP call; a per-call timeout (5s) makes "runs too long" count as a failed attempt.
Deterministic BullMQ job IDs (`do:${orderId}:${stepName}`, etc.) make re-enqueueing safe -
BullMQ treats `add()` with an existing, still-live job ID as a no-op.

**Restart recovery**: on boot, `ReconciliationService` finds every `IN_PROGRESS` saga and,
per step, re-enqueues anything `PENDING` or `RUNNING`-past-a-staleness-threshold (a crashed
worker's orphaned claim), or re-runs the fan-in decision directly if every step already
settled but the saga's own status wasn't updated (the crash landed exactly there). Every
action it takes is itself idempotent, so this is safe to run redundantly across replicas.

## Notification exactly-once

The coordinator pushes `{orderId, shippedAt}` to notification-service's own table the
moment an order is marked Shipped. A repeatable BullMQ job scans that table for `PENDING`
rows every `NOTIFICATION_SCAN_INTERVAL_MS` (15 minutes by default) and claims each one with
a conditional `UPDATE notifications SET status='SENT' WHERE order_id=? AND status='PENDING'`
- only the caller that gets `affected_rows = 1` sends it. This is correct under concurrent
replicas processing the same tick, and under the tick firing forever (an already-`SENT` row
is never re-selected).

## CSV ingestion at scale

`orders_bulk.csv` is parsed as a stream (`csv-parse`), never held fully in memory, in
batches of 500. Each batch does a `SELECT ... WHERE order_id IN (...)` first to find which
rows are genuinely new, then a batched `INSERT ... ON DUPLICATE KEY UPDATE` (a no-op for
existing rows), and only enqueues a `run-saga` job for the rows that were absent - so
re-uploading the same file creates zero duplicate orders.

## Frontend

The Angular app talks only to the coordinator (single facade), including "Mark Shipped" -
the coordinator is the only service positioned to both enforce the `PLACED -> SHIPPED`
guard and push to notification-service in the same request.

## Deliberate simplifications (see README's "Known scope cuts")

- One shared MySQL container locally with six databases, instead of six containers.
- CSV ingestion progress is tracked in-memory per coordinator process (single-replica
  assumption for that specific feature).
- The coordinator's push to notification-service on mark-shipped retries 3x but doesn't
  retry indefinitely on failure.
