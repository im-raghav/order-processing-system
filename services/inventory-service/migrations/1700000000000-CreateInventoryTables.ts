import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryTables1700000000000 implements MigrationInterface {
  name = 'CreateInventoryTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        sku           VARCHAR(64) NOT NULL PRIMARY KEY,
        available_qty INT NOT NULL,
        updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        order_id     VARCHAR(32) NOT NULL PRIMARY KEY,
        sku          VARCHAR(64) NOT NULL,
        qty          INT NOT NULL,
        status       ENUM('RESERVED','RELEASED') NOT NULL DEFAULT 'RESERVED',
        fail_at      VARCHAR(32) NULL,
        comp_fail_at VARCHAR(32) NULL,
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_sku (sku)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reservations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory;`);
  }
}
