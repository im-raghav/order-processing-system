import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentRecordStatus {
  CHARGED = 'CHARGED',
  REFUNDED = 'REFUNDED',
}

@Entity({ name: 'payments' })
export class PaymentEntity {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'status', type: 'enum', enum: PaymentRecordStatus, default: PaymentRecordStatus.CHARGED })
  status: PaymentRecordStatus;

  @Column({ name: 'fail_at', type: 'varchar', length: 32, nullable: true })
  failAt: string | null;

  @Column({ name: 'comp_fail_at', type: 'varchar', length: 32, nullable: true })
  compFailAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
