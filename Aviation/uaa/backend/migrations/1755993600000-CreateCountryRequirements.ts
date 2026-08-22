import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCountryRequirements1755993600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'country_requirements',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar', isUnique: true },
          { name: 'lead_time_hours', type: 'int' },
          { name: 'working_days_only', type: 'boolean', default: false },
          { name: 'tolerance_hours', type: 'int', default: 4 },
          { name: 'required_docs', type: 'text', isArray: true, default: "'{}'" },
          { name: 'submission_email', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('country_requirements');
  }
}
