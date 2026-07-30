import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum ShipmentRecordStatus {
  ARRANGED = 'ARRANGED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'shipments' })
export class ShipmentEntity {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Column({ name: 'sku', type: 'varchar', length: 64 })
  sku: string;

  @Column({ name: 'qty', type: 'int' })
  qty: number;

  @Column({ name: 'status', type: 'enum', enum: ShipmentRecordStatus, default: ShipmentRecordStatus.ARRANGED })
  status: ShipmentRecordStatus;

  @Column({ name: 'fail_at', type: 'varchar', length: 32, nullable: true })
  failAt: string | null;

  @Column({ name: 'comp_fail_at', type: 'varchar', length: 32, nullable: true })
  compFailAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
