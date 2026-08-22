import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFormTemplates1755993600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'form_templates',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar' },
          { name: 'name', type: 'varchar' },
          { name: 'body_template', type: 'text' },
          { name: 'merge_fields', type: 'text', isArray: true, default: "'{}'" },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('form_templates');
  }
}
