import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1700000000000 implements MigrationInterface {
  name = 'CreateOrders1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id     VARCHAR(32) NOT NULL PRIMARY KEY,
        sku          VARCHAR(64) NOT NULL,
        qty          INT NOT NULL,
        amount       DECIMAL(12,2) NOT NULL,
        status       ENUM('CREATED','CANCELLED') NOT NULL DEFAULT 'CREATED',
        fail_at      VARCHAR(32) NULL,
        comp_fail_at VARCHAR(32) NULL,
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS orders;`);
  }
}
