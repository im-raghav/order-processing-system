import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { BullMQRootModule } from '../src/bullmq/bullmq.module';
import { CsvIngestModule } from '../src/csv-ingest/csv-ingest.module';

jest.setTimeout(120000);

describe('CSV ingestion (e2e)', () => {
  let container: StartedMySqlContainer;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let csvPath: string;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8').withDatabase('coordinator').start();
    redisContainer = await new RedisContainer('redis:7').start();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getPort());

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
          migrationsRun: false,
          synchronize: true,
        }),
        BullMQRootModule(),
        CsvIngestModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    csvPath = path.join(os.tmpdir(), `ingest-test-${Date.now()}.csv`);
    const rows = [
      'order_id,sku,qty,amount,fail_at,comp_fail_at',
      'CSV001,WIDGET-A,2,19.99,,',
      'CSV002,WIDGET-B,1,9.99,CHARGE_PAYMENT,',
      'CSV003,GADGET-X,3,29.99,CREATE_SHIPMENT,REFUND_PAYMENT',
    ];
    fs.writeFileSync(csvPath, rows.join('\n'));
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
    await redisContainer.stop();
    fs.rmSync(csvPath, { force: true });
  });

  async function pollUntilDone(ingestJobId: string, timeoutMs = 20000): Promise<Record<string, unknown>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer()).get(`/api/csv/upload/${ingestJobId}/status`);
      if (res.body.done) return res.body;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Timed out waiting for ingestion to complete');
  }

  it('streams the CSV, inserts one saga per row, and preserves fail_at/comp_fail_at', async () => {
    const uploadRes = await request(app.getHttpServer())
      .post('/api/csv/upload')
      .attach('file', csvPath);
    expect(uploadRes.body.accepted).toBe(true);

    const status = await pollUntilDone(uploadRes.body.ingestJobId);
    expect(status.rowsRead).toBe(3);
    expect(status.rowsInserted).toBe(3);
    expect(status.rowsSkippedDuplicate).toBe(0);

    const rows = await dataSource.query(
      'SELECT order_id, sku, qty, fail_at, comp_fail_at FROM sagas WHERE order_id IN (?, ?, ?) ORDER BY order_id',
      ['CSV001', 'CSV002', 'CSV003'],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ order_id: 'CSV001', sku: 'WIDGET-A', fail_at: null, comp_fail_at: null });
    expect(rows[1]).toMatchObject({ order_id: 'CSV002', fail_at: 'CHARGE_PAYMENT', comp_fail_at: null });
    expect(rows[2]).toMatchObject({ order_id: 'CSV003', fail_at: 'CREATE_SHIPMENT', comp_fail_at: 'REFUND_PAYMENT' });
  });

  it('re-uploading the same file creates no duplicate sagas', async () => {
    const [{ count: before }] = await dataSource.query('SELECT COUNT(*) as count FROM sagas');

    const uploadRes = await request(app.getHttpServer())
      .post('/api/csv/upload')
      .attach('file', csvPath);
    const status = await pollUntilDone(uploadRes.body.ingestJobId);

    expect(status.rowsInserted).toBe(0);
    expect(status.rowsSkippedDuplicate).toBe(3);

    const [{ count: after }] = await dataSource.query('SELECT COUNT(*) as count FROM sagas');
    expect(Number(after)).toBe(Number(before));
  });
});
