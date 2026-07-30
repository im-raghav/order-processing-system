# Order Processing System

A saga-orchestrated order processing system: a coordinator drives four independent step
services (Order, Inventory, Payment, Shipping) in parallel per order, compensates
(undoes) completed steps if any step fails, survives restarts without losing or repeating
work, and flags orders that need manual attention when compensation itself gets stuck. A
separate Notification service sends exactly one notification per shipped order via a
recurring scan, safe under multiple replicas.

See `docs/ARCHITECTURE.md` for the full design rationale.

## Prerequisites

- Docker Desktop (with a working Linux engine - on Windows this requires WSL2 or Hyper-V)
- Node.js 20+ and npm (only needed if you want to run services outside Docker, or run tests)

## Running everything

```bash
cp .env.example .env
docker compose up --build
```

This starts:

| Service | Port |
|---|---|
| Angular frontend | http://localhost:4200 |
| Coordinator API | http://localhost:3000 |
| Order service | http://localhost:3001 |
| Inventory service | http://localhost:3002 |
| Payment service | http://localhost:3003 |
| Shipping service | http://localhost:3004 |
| Notification service | http://localhost:3005 |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |

Each service applies its own database migrations automatically on startup. Inventory
seeds its stock table from `sample_inventory.csv` (mounted into the container) the same
way - re-running never resets quantities already decremented by processed orders.

## Loading orders

Open the Angular app at http://localhost:4200 and use the **Upload CSV** button on the
order list page, or upload directly:

```bash
curl -F file=@orders_bulk.csv http://localhost:3000/api/csv/upload
```

The response includes an `ingestJobId`; poll `GET /api/csv/upload/:ingestJobId/status` for
progress. The file is streamed row-by-row (never held fully in memory), so this scales to
files far larger than the ~2,500-row sample. Re-uploading the same file creates no
duplicate orders.

`orders_bulk.csv`'s `fail_at`/`comp_fail_at` columns deliberately force certain steps (and
certain undos) to fail, so you can watch the Cancelled and Needs-attention paths happen
without waiting for a real failure. Expect roughly 181 of the 2,500 sample orders to end
Cancelled and ~17 to land in Needs-attention; the rest reach Placed.

## Demoing the notification job without waiting 15 minutes

Set `NOTIFICATION_SCAN_INTERVAL_MS` (in `.env` or the notification-service environment) to
something small, e.g. `5000`, before starting the stack, or restart just that service with
the override:

```bash
docker compose up -d --build -e NOTIFICATION_SCAN_INTERVAL_MS=5000 notification-service
```

Mark a Placed order Shipped from the UI (or `POST /api/orders/:orderId/mark-shipped`), then
watch the notification-service logs for `Notification sent for shipped order ...`.

## Running tests

Each service has unit tests (no external dependencies) and integration tests
(testcontainers, which need a working Docker engine):

```bash
npm install                 # once, from the repo root (npm workspaces)
npm run build --workspaces  # compile everything
npm test --workspaces       # unit tests
```

Per-service integration/e2e tests (each spins up its own ephemeral MySQL, and the
coordinator's tests also spin up Redis and the four real step services):

```bash
cd services/order-service && npm run test:e2e
cd services/inventory-service && npm run test:e2e
cd services/payment-service && npm run test:e2e
cd services/shipping-service && npm run test:e2e
cd services/notification-service && npm run test:e2e
cd services/coordinator && npm run test:e2e
```

The coordinator's `saga.e2e-spec.ts` is the main end-to-end proof: all-steps-succeed,
fail-and-fully-undo, never-done-twice (including concurrent duplicate submissions),
Needs-attention + manual retry, and restart recovery (a mid-flight saga seeded directly in
the database, resumed by `ReconciliationService.reconcile()`).

## Known scope cuts

- Local dev runs one shared MySQL container with six databases (one per service) rather
  than six separate containers - purely a laptop-resource simplification; no application
  code references another service's schema, so splitting them later is a compose-only
  change.
- CSV ingestion progress is tracked in-memory in the coordinator process; a multi-replica
  coordinator would need this in Redis instead to answer a status poll from any replica.
- If the coordinator's push to notification-service on mark-shipped fails after its 3
  retries, mark-shipped itself still succeeds (that's coordinator-owned truth) but the
  order won't get a notification until someone re-triggers the push - full outage recovery
  for that specific push is out of scope.
- No authentication/authorization, per the assignment's constraints.
