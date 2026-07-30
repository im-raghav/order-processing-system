import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { InventoryModule } from '../src/inventory/inventory.module';
import { CompStepName, StepName, StepOutcome } from '@order-system/shared-types';

describe('InventoryController (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8').withDatabase('inventory_service').start();

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'mysql',
          host: container.getHost(),
          port: container.getPort(),
          username: container.getUsername(),
          password: container.getUserPassword(),
          database: container.getDatabase(),
          entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/../migrations/*{.ts,.js}'],
          migrationsRun: true,
          synchronize: false,
        }),
        InventoryModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    await dataSource.query(
      `INSERT INTO inventory (sku, available_qty) VALUES ('SKU1', 100), ('SKU-SCARCE', 3)
       ON DUPLICATE KEY UPDATE sku = sku`,
    );
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function doPayload(orderId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      orderId,
      stepName: StepName.RESERVE_INVENTORY,
      sku: 'SKU1',
      qty: 2,
      amount: 10.5,
      failAt: null,
      compFailAt: null,
      ...overrides,
    };
  }

  async function availableQty(sku: string): Promise<number> {
    const [row] = await dataSource.query('SELECT available_qty FROM inventory WHERE sku = ?', [sku]);
    return row.available_qty;
  }

  it('reserves stock successfully on /do and decrements inventory exactly once', async () => {
    const before = await availableQty('SKU1');
    const res = await request(app.getHttpServer()).post('/do').send(doPayload('ORD1', { qty: 2 }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(res.body.alreadyDone).toBe(false);
    expect(await availableQty('SKU1')).toBe(before - 2);
  });

  it('never reserves twice - sequential retry does not decrement again', async () => {
    const payload = doPayload('ORD2', { qty: 3 });
    const before = await availableQty('SKU1');
    const first = await request(app.getHttpServer()).post('/do').send(payload);
    const second = await request(app.getHttpServer()).post('/do').send(payload);
    expect(first.body.alreadyDone).toBe(false);
    expect(second.body.alreadyDone).toBe(true);
    expect(await availableQty('SKU1')).toBe(before - 3);
  });

  it('never reserves twice - concurrent duplicate calls decrement exactly once', async () => {
    const payload = doPayload('ORD3', { qty: 4 });
    const before = await availableQty('SKU1');
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/do').send(payload),
      request(app.getHttpServer()).post('/do').send(payload),
    ]);
    expect([a.body.alreadyDone, b.body.alreadyDone].sort()).toEqual([false, true]);
    expect(await availableQty('SKU1')).toBe(before - 4);
  });

  it('honors fail_at to simulate a business failure without touching inventory', async () => {
    const before = await availableQty('SKU1');
    const payload = doPayload('ORD4', { failAt: StepName.RESERVE_INVENTORY });
    const first = await request(app.getHttpServer()).post('/do').send(payload);
    expect(first.body.outcome).toBe(StepOutcome.FAILURE);
    expect(first.body.reason).toBe('SIMULATED_FAILURE');
    expect(await availableQty('SKU1')).toBe(before);

    const second = await request(app.getHttpServer()).post('/do').send(payload);
    expect(second.body.outcome).toBe(StepOutcome.FAILURE);
    expect(await availableQty('SKU1')).toBe(before);
  });

  it('reports insufficient stock as a real failure and rolls back so a retry can succeed later', async () => {
    const payload = doPayload('ORD-SCARCE', { sku: 'SKU-SCARCE', qty: 10 });
    const first = await request(app.getHttpServer()).post('/do').send(payload);
    expect(first.body.outcome).toBe(StepOutcome.FAILURE);
    expect(first.body.reason).toBe('INSUFFICIENT_STOCK');
    expect(await availableQty('SKU-SCARCE')).toBe(3);

    const [{ count }] = await dataSource.query('SELECT COUNT(*) as count FROM reservations WHERE order_id = ?', [
      payload.orderId,
    ]);
    expect(Number(count)).toBe(0);

    const retryWithSmallerQty = await request(app.getHttpServer())
      .post('/do')
      .send({ ...payload, qty: 2 });
    expect(retryWithSmallerQty.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(await availableQty('SKU-SCARCE')).toBe(1);
  });

  it('releases (undoes) a reservation, idempotently, and restores inventory exactly once', async () => {
    const orderId = 'ORD5';
    await request(app.getHttpServer()).post('/do').send(doPayload(orderId, { qty: 5 }));
    const afterReserve = await availableQty('SKU1');

    const first = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.RESERVE_INVENTORY });
    expect(first.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(first.body.alreadyDone).toBe(false);
    expect(await availableQty('SKU1')).toBe(afterReserve + 5);

    const second = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.RESERVE_INVENTORY });
    expect(second.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(second.body.alreadyDone).toBe(true);
    expect(await availableQty('SKU1')).toBe(afterReserve + 5);
  });

  it('honors comp_fail_at to simulate a compensation failure, deterministically', async () => {
    const orderId = 'ORD6';
    await request(app.getHttpServer())
      .post('/do')
      .send(doPayload(orderId, { compFailAt: CompStepName.RELEASE_INVENTORY }));

    const attempt1 = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.RESERVE_INVENTORY });
    expect(attempt1.body.outcome).toBe(StepOutcome.FAILURE);

    const [row] = await dataSource.query('SELECT status FROM reservations WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('RESERVED');
  });

  it('GET /health reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
