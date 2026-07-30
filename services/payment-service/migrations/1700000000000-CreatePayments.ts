import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1700000000000 implements MigrationInterface {
  name = 'CreatePayments1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments (
        order_id     VARCHAR(32) NOT NULL PRIMARY KEY,
        amount       DECIMAL(12,2) NOT NULL,
        status       ENUM('CHARGED','REFUNDED') NOT NULL DEFAULT 'CHARGED',
        fail_at      VARCHAR(32) NULL,
        comp_fail_at VARCHAR(32) NULL,
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments;`);
  }
}
