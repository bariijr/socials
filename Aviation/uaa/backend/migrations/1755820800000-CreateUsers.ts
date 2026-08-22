import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsers1755820800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'username', type: 'varchar', isUnique: true },
          { name: 'full_name', type: 'varchar' },
          { name: 'job_title', type: 'varchar', isNullable: true },
          { name: 'mobile', type: 'varchar', isNullable: true },
          { name: 'from_email', type: 'varchar' },
          { name: 'cc_default', type: 'varchar', isNullable: true },
          { name: 'password_hash', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
