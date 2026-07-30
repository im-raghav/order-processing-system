import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_SAGA_ORCHESTRATION } from '@order-system/shared-types';
import { SagaEntity } from '../saga/entities/saga.entity';
import { CsvIngestController } from './csv-ingest.controller';
import { CsvIngestService } from './csv-ingest.service';

@Module({
  imports: [TypeOrmModule.forFeature([SagaEntity]), BullModule.registerQueue({ name: QUEUE_SAGA_ORCHESTRATION })],
  controllers: [CsvIngestController],
  providers: [CsvIngestService],
})
export class CsvIngestModule {}
