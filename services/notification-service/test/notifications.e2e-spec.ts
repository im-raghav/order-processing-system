import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { NotificationEntity } from '../src/notifications/entities/notification.entity';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';

// This test exercises NotificationsController/Service directly, without the full
// NotificationsModule (which also wires up BullMQ for the cron) - the exactly-once
// guarantee under test lives entirely in the claim-and-send SQL, not the scheduler,
// so there's no need for a Redis dependency here.
describe('Notifications (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let service: NotificationsService;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8').withDatabase('notification_service').start();

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
        TypeOrmModule.forFeature([NotificationEntity]),
      ],
      controllers: [NotificationsController],
      providers: [NotificationsService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(NotificationsService);
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('marks an order shipped exactly once even if the push is retried (duplicate call)', async () => {
    const orderId = 'ORD1';
    const shippedAt = new Date().toISOString();

    await request(app.getHttpServer()).post('/internal/orders-shipped').send({ orderId, shippedAt });
    await request(app.getHttpServer()).post('/internal/orders-shipped').send({ orderId, shippedAt });

    const [{ count }] = await dataSource.query('SELECT COUNT(*) as count FROM notifications WHERE order_id = ?', [
      orderId,
    ]);
    expect(Number(count)).toBe(1);

    const [row] = await dataSource.query('SELECT status FROM notifications WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('PENDING');
  });

  it('the scan sends a pending notification exactly once, and a later scan does not re-send', async () => {
    const orderId = 'ORD2';
    await request(app.getHttpServer())
      .post('/internal/orders-shipped')
      .send({ orderId, shippedAt: new Date().toISOString() });

    const first = await service.scanAndSendPending();
    expect(first.sent).toBeGreaterThanOrEqual(1);

    const [row] = await dataSource.query('SELECT status, sent_at FROM notifications WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('SENT');
    expect(row.sent_at).not.toBeNull();

    const second = await service.scanAndSendPending();
    const [rowAfter] = await dataSource.query('SELECT sent_at FROM notifications WHERE order_id = ?', [orderId]);
    expect(rowAfter.sent_at.getTime()).toBe(row.sent_at.getTime());
    void second;
  });

  it('never sends twice for the same order under concurrent scans (simulating overlapping replicas)', async () => {
    const orderId = 'ORD-CONCURRENT';
    await request(app.getHttpServer())
      .post('/internal/orders-shipped')
      .send({ orderId, shippedAt: new Date().toISOString() });

    const results = await Promise.all([
      service.scanAndSendPending(),
      service.scanAndSendPending(),
      service.scanAndSendPending(),
    ]);

    // only this one order is PENDING at this point in the test run, so exactly one of the
    // three concurrent scans should have won the claim and reported a send
    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    expect(totalSent).toBe(1);

    const [row] = await dataSource.query('SELECT status FROM notifications WHERE order_id = ?', [orderId]);
    expect(row.status).toBe('SENT');
  });

  it('GET /health reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
