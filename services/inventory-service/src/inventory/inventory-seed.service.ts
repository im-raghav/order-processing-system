import * as fs from 'fs';
import * as readline from 'readline';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItemEntity } from './entities/inventory-item.entity';

/**
 * Seeds the inventory table from sample_inventory.csv at startup. Uses
 * INSERT ... ON DUPLICATE KEY UPDATE sku=sku (a no-op on an existing row), so
 * restarting the service never resets stock that's already been decremented
 * by processed orders - the CSV only ever establishes the starting quantity.
 */
@Injectable()
export class InventorySeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InventorySeedService.name);

  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly inventoryRepository: Repository<InventoryItemEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const csvPath = process.env.INVENTORY_SEED_CSV_PATH || './sample_inventory.csv';

    if (!fs.existsSync(csvPath)) {
      this.logger.warn(`Inventory seed file not found at ${csvPath}, skipping seed`);
      return;
    }

    const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });
    let isHeader = true;
    let seeded = 0;

    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [sku, availableQtyRaw] = trimmed.split(',');
      const availableQty = parseInt(availableQtyRaw, 10);
      if (!sku || Number.isNaN(availableQty)) continue;

      await this.inventoryRepository.manager.query(
        `INSERT INTO inventory (sku, available_qty) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE sku = sku`,
        [sku, availableQty],
      );
      seeded += 1;
    }

    this.logger.log(`Inventory seed complete: ${seeded} SKUs checked from ${csvPath}`);
  }
}
