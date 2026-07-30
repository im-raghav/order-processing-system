import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSagas1700000000000 implements MigrationInterface {
  name = 'CreateSagas1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sagas (
        order_id        VARCHAR(32)  NOT NULL PRIMARY KEY,
        sku             VARCHAR(64)  NOT NULL,
        qty             INT          NOT NULL,
        amount          DECIMAL(12,2) NOT NULL,
        fail_at         VARCHAR(32)  NULL,
        comp_fail_at    VARCHAR(32)  NULL,
        status          ENUM('IN_PROGRESS','PLACED','SHIPPED','CANCELLED','NEEDS_ATTENTION')
                         NOT NULL DEFAULT 'IN_PROGRESS',
        pending_do_count INT NOT NULL DEFAULT 4,
        pending_undo_count INT NOT NULL DEFAULT 0,
        created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_status_created (status, created_at),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS saga_steps (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id       VARCHAR(32) NOT NULL,
        step_name      ENUM('CREATE_ORDER','RESERVE_INVENTORY','CHARGE_PAYMENT','CREATE_SHIPMENT') NOT NULL,
        phase          ENUM('DO','UNDO') NOT NULL,
        status         ENUM('PENDING','RUNNING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
        attempts       INT NOT NULL DEFAULT 0,
        last_error     TEXT NULL,
        started_at     DATETIME(3) NULL,
        finished_at    DATETIME(3) NULL,
        created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT uq_saga_step UNIQUE (order_id, step_name, phase),
        CONSTRAINT fk_saga_steps_order FOREIGN KEY (order_id) REFERENCES sagas(order_id),
        INDEX idx_order (order_id, id)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS saga_steps;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sagas;`);
  }
}
