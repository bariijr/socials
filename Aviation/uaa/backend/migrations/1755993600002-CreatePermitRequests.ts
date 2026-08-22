import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePermitRequests1755993600002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('permit_requests');
  }
}
