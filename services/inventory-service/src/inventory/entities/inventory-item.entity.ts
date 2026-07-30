import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'inventory' })
export class InventoryItemEntity {
  @PrimaryColumn({ name: 'sku', type: 'varchar', length: 64 })
  sku: string;

  @Column({ name: 'available_qty', type: 'int' })
  availableQty: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
