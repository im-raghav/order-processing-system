import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SagaStatus } from '@order-system/shared-types';

@Entity({ name: 'sagas' })
@Index('idx_status_created', ['status', 'createdAt'])
export class SagaEntity {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Column({ name: 'sku', type: 'varchar', length: 64 })
  sku: string;

  @Column({ name: 'qty', type: 'int' })
  qty: number;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'fail_at', type: 'varchar', length: 32, nullable: true })
  failAt: string | null;

  @Column({ name: 'comp_fail_at', type: 'varchar', length: 32, nullable: true })
  compFailAt: string | null;

  @Column({ name: 'status', type: 'enum', enum: SagaStatus, default: SagaStatus.IN_PROGRESS })
  status: SagaStatus;

  @Column({ name: 'pending_do_count', type: 'int', default: 4 })
  pendingDoCount: number;

  @Column({ name: 'pending_undo_count', type: 'int', default: 0 })
  pendingUndoCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
