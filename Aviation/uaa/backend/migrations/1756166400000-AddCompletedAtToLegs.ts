import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCompletedAtToLegs1756166400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'legs',
      new TableColumn({ name: 'completed_at', type: 'timestamptz', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('legs', 'completed_at');
  }
}
