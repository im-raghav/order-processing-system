import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum NotificationRecordStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
}

@Entity({ name: 'notifications' })
export class NotificationEntity {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 32 })
  orderId: string;

  @Index('idx_status')
  @Column({ name: 'status', type: 'enum', enum: NotificationRecordStatus, default: NotificationRecordStatus.PENDING })
  status: NotificationRecordStatus;

  @Column({ name: 'shipped_at', type: 'datetime', precision: 3 })
  shippedAt: Date;

  @Column({ name: 'sent_at', type: 'datetime', precision: 3, nullable: true })
  sentAt: Date | null;
}
