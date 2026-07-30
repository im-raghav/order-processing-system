import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_SAGA_ORCHESTRATION, QUEUE_SAGA_STEP_DO, QUEUE_SAGA_STEP_UNDO } from '@order-system/shared-types';
import { SagaEntity } from './entities/saga.entity';
import { SagaStepEntity } from './entities/saga-step.entity';
import { SagaController } from './saga.controller';
import { SagaService } from './saga.service';
import { stepClientsProvider } from './step-clients/step-clients.provider';
import { SagaOrchestrationProcessor } from './processors/saga-orchestration.processor';
import { SagaStepDoProcessor } from './processors/saga-step-do.processor';
import { SagaStepUndoProcessor } from './processors/saga-step-undo.processor';
import { ReconciliationService } from './reconciliation.service';
import { NotificationPusherService } from './notification-pusher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SagaEntity, SagaStepEntity]),
    BullModule.registerQueue(
      { name: QUEUE_SAGA_ORCHESTRATION },
      { name: QUEUE_SAGA_STEP_DO },
      { name: QUEUE_SAGA_STEP_UNDO },
    ),
  ],
  controllers: [SagaController],
  providers: [
    SagaService,
    stepClientsProvider,
    SagaOrchestrationProcessor,
    SagaStepDoProcessor,
    SagaStepUndoProcessor,
    ReconciliationService,
    NotificationPusherService,
  ],
  exports: [SagaService],
})
export class SagaModule {}
