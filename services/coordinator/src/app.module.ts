import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { BullMQRootModule } from './bullmq/bullmq.module';
import { SagaModule } from './saga/saga.module';
import { CsvIngestModule } from './csv-ingest/csv-ingest.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    BullMQRootModule(),
    SagaModule,
    CsvIngestModule,
  ],
})
export class AppModule {}
