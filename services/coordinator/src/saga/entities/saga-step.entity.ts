import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Phase, StepName, StepStatus } from '@order-system/shared-types';

@Entity({ name: 'saga_steps' })
@Unique('uq_saga_step', ['orderId', 'stepName', 'phase'])
@Index('idx_order', ['orderId', 'id'])
export class SagaStepEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Column({ name: 'step_name', type: 'enum', enum: StepName })
  stepName: StepName;

  @Column({ name: 'phase', type: 'enum', enum: Phase })
  phase: Phase;

  @Column({ name: 'status', type: 'enum', enum: StepStatus, default: StepStatus.PENDING })
  status: StepStatus;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'started_at', type: 'datetime', precision: 3, nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', precision: 3, nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
