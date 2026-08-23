import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class CreateTripsAndBackfillLegs1756252800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'trips',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'trip_no', type: 'varchar', isUnique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(`
      INSERT INTO trips (trip_no)
      SELECT DISTINCT trip_no FROM legs
    `);

    await queryRunner.addColumn(
      'legs',
      new TableColumn({ name: 'trip_id', type: 'uuid', isNullable: true }),
    );

    await queryRunner.query(`
      UPDATE legs SET trip_id = trips.id
      FROM trips
      WHERE legs.trip_no = trips.trip_no
    `);

    await queryRunner.changeColumn(
      'legs',
      'trip_id',
      new TableColumn({ name: 'trip_id', type: 'uuid', isNullable: false }),
    );

    await queryRunner.createForeignKey(
      'legs',
      new TableForeignKey({
        columnNames: ['trip_id'],
        referencedTableName: 'trips',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('legs');
    const foreignKey = table?.foreignKeys.find((fk) => fk.columnNames.includes('trip_id'));
    if (foreignKey) await queryRunner.dropForeignKey('legs', foreignKey);
    await queryRunner.dropColumn('legs', 'trip_id');
    await queryRunner.dropTable('trips');
  }
}
