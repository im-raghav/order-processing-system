import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { parse } from 'csv-parse';
import { JOB_RUN_SAGA, QUEUE_SAGA_ORCHESTRATION, runSagaJobId } from '@order-system/shared-types';
import { SagaEntity } from '../saga/entities/saga.entity';
import { ORCHESTRATION_JOB_OPTIONS } from '../saga/bullmq-job-options';
import { IngestProgress } from './ingest-progress';

const BATCH_SIZE = 500;

interface CsvRow {
  order_id: string;
  sku: string;
  qty: string;
  amount: string;
  fail_at?: string;
  comp_fail_at?: string;
}

@Injectable()
export class CsvIngestService {
  private readonly logger = new Logger(CsvIngestService.name);
  // In-memory progress tracking is a single-coordinator-instance simplification: a multi-
  // replica coordinator would need this in Redis instead so any replica can answer a status
  // poll, called out as a known scope cut in the run guide.
  private readonly progress = new Map<string, IngestProgress>();

  constructor(
    @InjectRepository(SagaEntity)
    private readonly sagasRepository: Repository<SagaEntity>,
    @InjectQueue(QUEUE_SAGA_ORCHESTRATION)
    private readonly orchestrationQueue: Queue,
  ) {}

  /** Kicks off streaming ingestion in the background and returns immediately with an id to
   * poll - the caller (the HTTP request) never waits for the whole file to be processed. */
  startIngestion(filePath: string): string {
    const ingestJobId = randomUUID();
    this.progress.set(ingestJobId, { rowsRead: 0, rowsInserted: 0, rowsSkippedDuplicate: 0, done: false });
    void this.runIngestion(ingestJobId, filePath);
    return ingestJobId;
  }

  getProgress(ingestJobId: string): IngestProgress {
    const p = this.progress.get(ingestJobId);
    if (!p) throw new NotFoundException(`Unknown ingestJobId ${ingestJobId}`);
    return p;
  }

  private async runIngestion(ingestJobId: string, filePath: string): Promise<void> {
    const progress = this.progress.get(ingestJobId);
    if (!progress) return;

    try {
      const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true }));
      let batch: CsvRow[] = [];

      // the async-iterator loop only pulls the next row after each batch's awaited DB
      // round-trip resolves, so the stream backpressures naturally instead of buffering
      // the whole file in memory regardless of how large it is
      for await (const row of parser as AsyncIterable<CsvRow>) {
        progress.rowsRead++;
        batch.push(row);
        if (batch.length >= BATCH_SIZE) {
          await this.processBatch(batch, progress);
          batch = [];
        }
      }
      if (batch.length > 0) {
        await this.processBatch(batch, progress);
      }
    } catch (err) {
      progress.error = err instanceof Error ? err.message : String(err);
      this.logger.error(`CSV ingestion ${ingestJobId} failed: ${progress.error}`);
    } finally {
      progress.done = true;
      fs.unlink(filePath, () => undefined);
    }
  }

  /** Batched insert keyed by order_id (idempotent: ON DUPLICATE KEY UPDATE is a no-op), so
   * re-uploading the same file enqueues zero duplicate sagas - only rows that were genuinely
   * new before this batch's insert get a run-saga job. */
  private async processBatch(batch: CsvRow[], progress: IngestProgress): Promise<void> {
    const orderIds = batch.map((r) => r.order_id);
    const existingRows: Array<{ order_id: string }> = await this.sagasRepository.manager.query(
      `SELECT order_id FROM sagas WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds,
    );
    const existingIds = new Set(existingRows.map((r) => r.order_id));

    const placeholders: string[] = [];
    const values: unknown[] = [];
    for (const row of batch) {
      placeholders.push(`(?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 4, 0)`);
      values.push(
        row.order_id,
        row.sku,
        parseInt(row.qty, 10),
        parseFloat(row.amount),
        row.fail_at || null,
        row.comp_fail_at || null,
      );
    }

    await this.sagasRepository.manager.query(
      `INSERT INTO sagas (order_id, sku, qty, amount, fail_at, comp_fail_at, status, pending_do_count, pending_undo_count)
       VALUES ${placeholders.join(', ')}
       ON DUPLICATE KEY UPDATE order_id = order_id`,
      values,
    );

    for (const row of batch) {
      if (existingIds.has(row.order_id)) {
        progress.rowsSkippedDuplicate++;
        continue;
      }
      progress.rowsInserted++;
      await this.orchestrationQueue.add(
        JOB_RUN_SAGA,
        { orderId: row.order_id },
        { ...ORCHESTRATION_JOB_OPTIONS, jobId: runSagaJobId(row.order_id) },
      );
    }
  }
}
