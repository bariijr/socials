import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateServiceCaseModel1756339200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'requirements',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'leg_id', type: 'uuid' },
          { name: 'country', type: 'varchar' },
          { name: 'service_category', type: 'varchar', default: "'PERMIT'" },
          { name: 'service_type', type: 'varchar', default: "'PERMIT'" },
          { name: 'responsibility', type: 'varchar', default: "'OUR_ARRANGEMENT'" },
          { name: 'required_by_z', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'service_cases',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'requirement_id', type: 'uuid' },
          { name: 'status', type: 'varchar', default: "'NOT_STARTED'" },
          { name: 'valid_from', type: 'timestamptz', isNullable: true },
          { name: 'valid_to', type: 'timestamptz', isNullable: true },
          { name: 'clearance_number', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'service_orders',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'service_case_id', type: 'uuid' },
          { name: 'submission_email', type: 'varchar', isNullable: true },
          { name: 'correlation_token', type: 'varchar', isUnique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    // service_cases.id and requirements.id both reuse the original permit_requests.id for
    // the corresponding row — harmless (PKs are only unique within their own table), and it
    // means comms.permit_request_id's existing values are already valid service_cases.id
    // values, so the Comms migration below is a plain column rename, not a data rewrite.
    await queryRunner.query(`
      INSERT INTO requirements (id, leg_id, country, service_category, service_type, responsibility, required_by_z, created_at, updated_at)
      SELECT id, leg_id, country, 'PERMIT', 'PERMIT', 'OUR_ARRANGEMENT', required_by_z, created_at, updated_at
      FROM permit_requests
    `);

    await queryRunner.query(`
      INSERT INTO service_cases (id, requirement_id, status, valid_from, valid_to, clearance_number, created_at, updated_at)
      SELECT id, id, status, valid_from, valid_to, clearance_number, created_at, updated_at
      FROM permit_requests
    `);

    await queryRunner.query(`
      INSERT INTO service_orders (id, service_case_id, submission_email, correlation_token, created_at, updated_at)
      SELECT gen_random_uuid(), id, submission_email, correlation_token, created_at, updated_at
      FROM permit_requests
    `);

    await queryRunner.query(`ALTER TABLE comms RENAME COLUMN permit_request_id TO service_case_id`);

    await queryRunner.dropTable('permit_requests');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'permit_requests',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'leg_id', type: 'uuid' },
          { name: 'country', type: 'varchar' },
          { name: 'status', type: 'varchar', default: "'NOT_STARTED'" },
          { name: 'required_by_z', type: 'timestamptz', isNullable: true },
          { name: 'valid_from', type: 'timestamptz', isNullable: true },
          { name: 'valid_to', type: 'timestamptz', isNullable: true },
          { name: 'clearance_number', type: 'varchar', isNullable: true },
          { name: 'correlation_token', type: 'varchar', isUnique: true },
          { name: 'submission_email', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(`
      INSERT INTO permit_requests (id, leg_id, country, status, required_by_z, valid_from, valid_to, clearance_number, correlation_token, submission_email, created_at, updated_at)
      SELECT r.id, r.leg_id, r.country, sc.status, r.required_by_z, sc.valid_from, sc.valid_to, sc.clearance_number, so.correlation_token, so.submission_email, sc.created_at, sc.updated_at
      FROM requirements r
      JOIN service_cases sc ON sc.requirement_id = r.id
      JOIN service_orders so ON so.service_case_id = sc.id
    `);

    await queryRunner.query(`ALTER TABLE comms RENAME COLUMN service_case_id TO permit_request_id`);

    await queryRunner.dropTable('service_orders');
    await queryRunner.dropTable('service_cases');
    await queryRunner.dropTable('requirements');
  }
}
