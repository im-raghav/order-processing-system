import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1700000000000 implements MigrationInterface {
  name = 'CreateNotifications1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        order_id   VARCHAR(32) NOT NULL PRIMARY KEY,
        status     ENUM('PENDING','SENT') NOT NULL DEFAULT 'PENDING',
        shipped_at DATETIME(3) NOT NULL,
        sent_at    DATETIME(3) NULL,
        INDEX idx_status (status)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notifications;`);
  }
}
