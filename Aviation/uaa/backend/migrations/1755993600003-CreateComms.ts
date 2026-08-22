import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateComms1755993600003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'comms',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'direction', type: 'varchar' },
          { name: 'leg_id', type: 'uuid', isNullable: true },
          { name: 'permit_request_id', type: 'uuid', isNullable: true },
          { name: 'correlation_token', type: 'varchar', isNullable: true },
          { name: 'from_address', type: 'varchar' },
          { name: 'to_address', type: 'varchar' },
          { name: 'subject', type: 'varchar' },
          { name: 'body', type: 'text' },
          { name: 'kind', type: 'varchar' },
          { name: 'sent_at', type: 'timestamptz' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('comms');
  }
}
