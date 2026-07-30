import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { SagaModule } from '../src/saga/saga.module';
import { ReconciliationService } from '../src/saga/reconciliation.service';
import { BullMQRootModule } from '../src/bullmq/bullmq.module';
import { SagaStatus, StepStatus, StepName, CompStepName, Phase } from '@order-system/shared-types';

// Real step-service Nest apps, imported across the monorepo package boundary purely for
// this integration test - this is what lets the test exercise the actual saga end-to-end
// (parallel do, compensation on failure, idempotency) rather than mocking the HTTP calls.
import { OrdersModule } from '../../order-service/src/orders/orders.module';
import { InventoryModule } from '../../inventory-service/src/inventory/inventory.module';
import { PaymentsModule } from '../../payment-service/src/payments/payments.module';
import { ShipmentsModule } from '../../shipping-service/src/shipments/shipments.module';

jest.setTimeout(180000);

async function bootServiceApp(module: unknown, container: StartedMySqlContainer, database: string): Promise<{
  app: INestApplication;
  url: string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'mysql',
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getUserPassword(),
        database,
        entities: [__dirname + `/../../*-service/src/**/*.entity{.ts,.js}`],
        migrationsRun: false,
        synchronize: true,
      }),
      module as never,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  await app.listen(0);
  const url = await app.getUrl();
  return { app, url };
}

describe('Saga orchestration (e2e)', () => {
  let container: StartedMySqlContainer;
  let redisContainer: StartedRedisContainer;
  let orderApp: INestApplication;
  let inventoryApp: INestApplication;
  let paymentApp: INestApplication;
  let shippingApp: INestApplication;
  let coordinatorApp: INestApplication;
  let reconciliationService: ReconciliationService;
  let coordinatorDataSource: DataSource;
  let inventoryDataSource: DataSource;
  let paymentDataSource: DataSource;
  let shippingDataSource: DataSource;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8').withDatabase('order_service').start();
    redisContainer = await new RedisContainer('redis:7').start();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getPort());

    const rootConn = await new DataSource({
      type: 'mysql',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getUserPassword(),
      database: container.getDatabase(),
    }).initialize();
    await rootConn.query('CREATE DATABASE IF NOT EXISTS inventory_service');
    await rootConn.query('CREATE DATABASE IF NOT EXISTS payment_service');
    await rootConn.query('CREATE DATABASE IF NOT EXISTS shipping_service');
    await rootConn.query('CREATE DATABASE IF NOT EXISTS coordinator');
    await rootConn.destroy();

    const order = await bootServiceApp(OrdersModule, container, 'order_service');
    orderApp = order.app;
    const inventory = await bootServiceApp(InventoryModule, container, 'inventory_service');
    inventoryApp = inventory.app;
    const payment = await bootServiceApp(PaymentsModule, container, 'payment_service');
    paymentApp = payment.app;
    const shipping = await bootServiceApp(ShipmentsModule, container, 'shipping_service');
    shippingApp = shipping.app;

    process.env.ORDER_SERVICE_URL = order.url;
    process.env.INVENTORY_SERVICE_URL = inventory.url;
    process.env.PAYMENT_SERVICE_URL = payment.url;
    process.env.SHIPPING_SERVICE_URL = shipping.url;

    const coordinatorModuleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'mysql',
          host: container.getHost(),
          port: container.getPort(),
          username: container.getUsername(),
          password: container.getUserPassword(),
          database: 'coordinator',
          entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
          migrationsRun: false,
          synchronize: true,
        }),
        BullMQRootModule(),
        SagaModule,
      ],
    }).compile();

    coordinatorApp = coordinatorModuleRef.createNestApplication();
    coordinatorApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await coordinatorApp.init();
    coordinatorDataSource = coordinatorModuleRef.get(DataSource);
    reconciliationService = coordinatorModuleRef.get(ReconciliationService);

    inventoryDataSource = (await new DataSource({
      type: 'mysql',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getUserPassword(),
      database: 'inventory_service',
    }).initialize());
    paymentDataSource = await new DataSource({
      type: 'mysql',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getUserPassword(),
      database: 'payment_service',
    }).initialize();
    shippingDataSource = await new DataSource({
      type: 'mysql',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getUserPassword(),
      database: 'shipping_service',
    }).initialize();

    await inventoryDataSource.query(
      `INSERT INTO inventory (sku, available_qty) VALUES ('SKU1', 100000) ON DUPLICATE KEY UPDATE sku = sku`,
    );
  }, 180000);

  afterAll(async () => {
    await coordinatorApp.close();
    await orderApp.close();
    await inventoryApp.close();
    await paymentApp.close();
    await shippingApp.close();
    await inventoryDataSource.destroy();
    await paymentDataSource.destroy();
    await shippingDataSource.destroy();
    await container.stop();
    await redisContainer.stop();
  });

  async function waitForSagaStatus(orderId: string, notStatus: SagaStatus, timeoutMs = 30000): Promise<SagaStatus> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const [row] = await coordinatorDataSource.query('SELECT status FROM sagas WHERE order_id = ?', [orderId]);
      if (row && row.status !== notStatus) return row.status;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timed out waiting for ${orderId} to leave ${notStatus}`);
  }

  function createPayload(orderId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      orderId,
      sku: 'SKU1',
      qty: 1,
      amount: 9.99,
      failAt: null,
      compFailAt: null,
      ...overrides,
    };
  }

  it('all steps succeed -> order is Placed with all 4 DO steps DONE and no UNDO rows', async () => {
    const httpApp = coordinatorApp.getHttpServer();
    const request = (await import('supertest')).default;
    const orderId = 'SAGA-ALL-OK';

    await request(httpApp).post('/api/orders').send(createPayload(orderId));
    const finalStatus = await waitForSagaStatus(orderId, SagaStatus.IN_PROGRESS);
    expect(finalStatus).toBe(SagaStatus.PLACED);

    const steps = await coordinatorDataSource.query(
      'SELECT step_name, phase, status FROM saga_steps WHERE order_id = ?',
      [orderId],
    );
    const doSteps = steps.filter((s: { phase: string }) => s.phase === Phase.DO);
    const undoSteps = steps.filter((s: { phase: string }) => s.phase === Phase.UNDO);
    expect(doSteps).toHaveLength(4);
    expect(doSteps.every((s: { status: string }) => s.status === StepStatus.DONE)).toBe(true);
    expect(undoSteps).toHaveLength(0);
  });

  it('a step fails -> completed steps are undone and the order ends Cancelled', async () => {
    const httpApp = coordinatorApp.getHttpServer();
    const request = (await import('supertest')).default;
    const orderId = 'SAGA-FAIL-UNDO';

    await request(httpApp)
      .post('/api/orders')
      .send(createPayload(orderId, { failAt: StepName.CHARGE_PAYMENT }));
    const finalStatus = await waitForSagaStatus(orderId, SagaStatus.IN_PROGRESS);
    expect(finalStatus).toBe(SagaStatus.CANCELLED);

    const steps = await coordinatorDataSource.query(
      'SELECT step_name, phase, status FROM saga_steps WHERE order_id = ?',
      [orderId],
    );
    const paymentDo = steps.find((s: { step_name: string; phase: string }) => s.step_name === StepName.CHARGE_PAYMENT && s.phase === Phase.DO);
    expect(paymentDo.status).toBe(StepStatus.FAILED);

    const undoSteps = steps.filter((s: { phase: string }) => s.phase === Phase.UNDO);
    expect(undoSteps.length).toBeGreaterThan(0);
    expect(undoSteps.every((s: { status: string }) => s.status === StepStatus.DONE)).toBe(true);

    const [orderRow] = await coordinatorDataSource.query(
      `SELECT step_name FROM saga_steps WHERE order_id = ? AND phase = 'DO' AND step_name = 'CREATE_ORDER' AND status = 'DONE'`,
      [orderId],
    );
    if (orderRow) {
      const orderDataSource = new DataSource({
        type: 'mysql',
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getUserPassword(),
        database: 'order_service',
      });
      await orderDataSource.initialize();
      const [row] = await orderDataSource.query('SELECT status FROM orders WHERE order_id = ?', [orderId]);
      expect(row.status).toBe('CANCELLED');
      await orderDataSource.destroy();
    }
  });

  it('never runs a saga twice for the same order, even under concurrent duplicate submissions', async () => {
    const httpApp = coordinatorApp.getHttpServer();
    const request = (await import('supertest')).default;
    const orderId = 'SAGA-NEVER-TWICE';

    await Promise.all([
      request(httpApp).post('/api/orders').send(createPayload(orderId)),
      request(httpApp).post('/api/orders').send(createPayload(orderId)),
    ]);
    await waitForSagaStatus(orderId, SagaStatus.IN_PROGRESS);

    const [{ count }] = await coordinatorDataSource.query('SELECT COUNT(*) as count FROM sagas WHERE order_id = ?', [
      orderId,
    ]);
    expect(Number(count)).toBe(1);

    const [{ count: reservationCount }] = await inventoryDataSource.query(
      'SELECT COUNT(*) as count FROM reservations WHERE order_id = ?',
      [orderId],
    );
    expect(Number(reservationCount)).toBe(1);
  });

  it('a stuck compensation is flagged Needs-attention, and Retry resolves it once the condition clears', async () => {
    const httpApp = coordinatorApp.getHttpServer();
    const request = (await import('supertest')).default;
    const orderId = 'SAGA-NEEDS-ATTENTION';

    await request(httpApp)
      .post('/api/orders')
      .send(
        createPayload(orderId, {
          failAt: StepName.CREATE_SHIPMENT,
          compFailAt: CompStepName.REFUND_PAYMENT,
        }),
      );
    const finalStatus = await waitForSagaStatus(orderId, SagaStatus.IN_PROGRESS);
    expect(finalStatus).toBe(SagaStatus.NEEDS_ATTENTION);

    // simulate the underlying condition being fixed out-of-band, then hit Retry
    await paymentDataSource.query(`UPDATE payments SET comp_fail_at = NULL WHERE order_id = ?`, [orderId]);
    await request(httpApp).post(`/api/orders/${orderId}/retry-compensation`);

    const [row] = await coordinatorDataSource.query('SELECT status FROM sagas WHERE order_id = ?', [orderId]);
    expect(row.status).toBe(SagaStatus.CANCELLED);
  });

  it('restart recovery: resumes a saga left mid-flight (2 done, 1 pending, 1 orphaned-running)', async () => {
    const httpApp = coordinatorApp.getHttpServer();
    const request = (await import('supertest')).default;
    const orderId = 'SAGA-RECONCILE';

    // seed the saga row directly, as if the CSV ingestion inserted it but the process
    // crashed partway through the first two steps
    await coordinatorDataSource.query(
      `INSERT INTO sagas (order_id, sku, qty, amount, fail_at, comp_fail_at, status, pending_do_count, pending_undo_count)
       VALUES (?, 'SKU1', 1, 9.99, NULL, NULL, 'IN_PROGRESS', 2, 0)`,
      [orderId],
    );

    // CREATE_ORDER and RESERVE_INVENTORY really completed (call the real services directly,
    // exactly as the do-processor would have) - these are the two DO steps we mark DONE
    await request(orderApp.getHttpServer())
      .post('/do')
      .send({ orderId, stepName: StepName.CREATE_ORDER, sku: 'SKU1', qty: 1, amount: 9.99, failAt: null, compFailAt: null });
    await request(inventoryApp.getHttpServer())
      .post('/do')
      .send({ orderId, stepName: StepName.RESERVE_INVENTORY, sku: 'SKU1', qty: 1, amount: 9.99, failAt: null, compFailAt: null });

    await coordinatorDataSource.query(
      `INSERT INTO saga_steps (order_id, step_name, phase, status, attempts, finished_at) VALUES
       (?, 'CREATE_ORDER', 'DO', 'DONE', 1, NOW(3)),
       (?, 'RESERVE_INVENTORY', 'DO', 'DONE', 1, NOW(3)),
       (?, 'CHARGE_PAYMENT', 'DO', 'PENDING', 0, NULL),
       (?, 'CREATE_SHIPMENT', 'DO', 'RUNNING', 1, NULL)`,
      [orderId, orderId, orderId, orderId],
    );
    // backdate CREATE_SHIPMENT's started_at so it looks orphaned (worker crashed mid-call)
    await coordinatorDataSource.query(
      `UPDATE saga_steps SET started_at = DATE_SUB(NOW(3), INTERVAL 10 MINUTE)
       WHERE order_id = ? AND step_name = 'CREATE_SHIPMENT' AND phase = 'DO'`,
      [orderId],
    );

    await reconciliationService.reconcile();

    const finalStatus = await waitForSagaStatus(orderId, SagaStatus.IN_PROGRESS);
    expect(finalStatus).toBe(SagaStatus.PLACED);

    const steps = await coordinatorDataSource.query(
      'SELECT step_name, status FROM saga_steps WHERE order_id = ? AND phase = "DO"',
      [orderId],
    );
    expect(steps.every((s: { status: string }) => s.status === StepStatus.DONE)).toBe(true);
  });
});
