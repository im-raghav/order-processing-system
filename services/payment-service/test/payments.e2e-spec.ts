import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { PaymentsModule } from '../src/payments/payments.module';
import { CompStepName, StepName, StepOutcome } from '@order-system/shared-types';

describe('PaymentsController (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8').withDatabase('payment_service').start();

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
        PaymentsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function doPayload(orderId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      orderId,
      stepName: StepName.CHARGE_PAYMENT,
      sku: 'SKU1',
      qty: 2,
      amount: 10.5,
      failAt: null,
      compFailAt: null,
      ...overrides,
    };
  }

  it('charges successfully on /do', async () => {
    const res = await request(app.getHttpServer()).post('/do').send(doPayload('ORD1'));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(res.body.alreadyDone).toBe(false);
  });

  it('never charges twice - sequential retry returns alreadyDone true and no new row', async () => {
    const payload = doPayload('ORD2');
    const first = await request(app.getHttpServer()).post('/do').send(payload);
    const second = await request(app.getHttpServer()).post('/do').send(payload);
    expect(first.body.alreadyDone).toBe(false);
    expect(second.body.alreadyDone).toBe(true);
    expect(second.body.outcome).toBe(StepOutcome.SUCCESS);

    const [{ count }] = await dataSource.query('SELECT COUNT(*) as count FROM payments WHERE order_id = ?', [
      payload.orderId,
    ]);
    expect(Number(count)).toBe(1);
  });

  it('never charges twice - concurrent duplicate calls still produce exactly one row', async () => {
    const payload = doPayload('ORD3');
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/do').send(payload),
      request(app.getHttpServer()).post('/do').send(payload),
    ]);
    expect([a.body.alreadyDone, b.body.alreadyDone].sort()).toEqual([false, true]);

    const [{ count }] = await dataSource.query('SELECT COUNT(*) as count FROM payments WHERE order_id = ?', [
      payload.orderId,
    ]);
    expect(Number(count)).toBe(1);
  });

  it('honors fail_at to simulate a business failure, permanently', async () => {
    const payload = doPayload('ORD4', { failAt: StepName.CHARGE_PAYMENT });
    const first = await request(app.getHttpServer()).post('/do').send(payload);
    expect(first.body.outcome).toBe(StepOutcome.FAILURE);
    expect(first.body.reason).toBe('SIMULATED_FAILURE');

    const second = await request(app.getHttpServer()).post('/do').send(payload);
    expect(second.body.outcome).toBe(StepOutcome.FAILURE);
    expect(second.body.alreadyDone).toBe(false);
  });

  it('refunds a charged payment, idempotently', async () => {
    const orderId = 'ORD5';
    await request(app.getHttpServer()).post('/do').send(doPayload(orderId));

    const first = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.CHARGE_PAYMENT });
    expect(first.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(first.body.alreadyDone).toBe(false);

    const second = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.CHARGE_PAYMENT });
    expect(second.body.outcome).toBe(StepOutcome.SUCCESS);
    expect(second.body.alreadyDone).toBe(true);

    const [row] = await dataSource.query('SELECT status FROM payments WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('REFUNDED');
  });

  it('honors comp_fail_at to simulate a compensation failure, deterministically', async () => {
    const orderId = 'ORD6';
    await request(app.getHttpServer())
      .post('/do')
      .send(doPayload(orderId, { compFailAt: CompStepName.REFUND_PAYMENT }));

    const attempt1 = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.CHARGE_PAYMENT });
    expect(attempt1.body.outcome).toBe(StepOutcome.FAILURE);

    const attempt2 = await request(app.getHttpServer())
      .post('/undo')
      .send({ orderId, stepName: StepName.CHARGE_PAYMENT });
    expect(attempt2.body.outcome).toBe(StepOutcome.FAILURE);

    const [row] = await dataSource.query('SELECT status FROM payments WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('CHARGED');
  });

  it('GET /health reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
