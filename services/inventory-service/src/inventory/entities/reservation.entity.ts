import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum ReservationRecordStatus {
  RESERVED = 'RESERVED',
  RELEASED = 'RELEASED',
}

@Entity({ name: 'reservations' })
export class ReservationEntity {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Index('idx_sku')
  @Column({ name: 'sku', type: 'varchar', length: 64 })
  sku: string;

  @Column({ name: 'qty', type: 'int' })
  qty: number;

  @Column({ name: 'status', type: 'enum', enum: ReservationRecordStatus, default: ReservationRecordStatus.RESERVED })
  status: ReservationRecordStatus;

  @Column({ name: 'fail_at', type: 'varchar', length: 32, nullable: true })
  failAt: string | null;

  @Column({ name: 'comp_fail_at', type: 'varchar', length: 32, nullable: true })
  compFailAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
