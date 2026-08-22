import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateLegs1755820800001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'legs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar', isNullable: true },
          { name: 'region', type: 'varchar', isNullable: true },
          { name: 'ref_no', type: 'varchar', isNullable: true },
          { name: 'client_name', type: 'varchar', isNullable: true },
          { name: 'operator_name', type: 'varchar', isNullable: true },
          { name: 'client_no', type: 'varchar', isNullable: true },
          { name: 'agent_name', type: 'varchar', isNullable: true },
          { name: 'service_report_sent', type: 'boolean', default: false },
          { name: 'returned_in_time', type: 'boolean', default: false },
          { name: 'agent_contacts', type: 'varchar', isNullable: true },
          { name: 'trip_no', type: 'varchar' },
          { name: 'tail', type: 'varchar', isNullable: true },
          { name: 'icao', type: 'varchar' },
          { name: 'arr_date', type: 'timestamptz', isNullable: true },
          { name: 'dep_date', type: 'timestamptz', isNullable: true },
          { name: 'arr_from', type: 'varchar', isNullable: true },
          { name: 'dep_to_icao', type: 'varchar', isNullable: true },
          { name: 'activity_type', type: 'varchar', isNullable: true },
          { name: 'progress', type: 'varchar', isNullable: true },
          { name: 'capt_name', type: 'varchar', isNullable: true },
          { name: 'capt_email', type: 'varchar', isNullable: true },
          { name: 'ac_type', type: 'varchar', isNullable: true },
          { name: 'mtow_lb', type: 'int', isNullable: true },
          { name: 'pgh', type: 'varchar', isNullable: true },
          { name: 'tss_team', type: 'varchar', isNullable: true },
          { name: 'clearance_number', type: 'varchar', isNullable: true },
          { name: 'tss_notified', type: 'boolean', default: false },
          { name: 'client_notified', type: 'boolean', default: false },
          { name: 'agent_expenses', type: 'varchar', isNullable: true },
          { name: 'ready_to_bill', type: 'boolean', default: false },
          { name: 'invoice_received', type: 'boolean', default: false },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'a2g_supervisor', type: 'varchar', isNullable: true },
          { name: 'drive_complete_date', type: 'timestamptz', isNullable: true },
          { name: 'a2g_invoice_number', type: 'varchar', isNullable: true },
          { name: 'process_by', type: 'varchar', isNullable: true },
          { name: 'process_date', type: 'timestamptz', isNullable: true },
          { name: 'billing_month', type: 'varchar', isNullable: true },
          { name: 'semaphore', type: 'varchar', isNullable: true },
          { name: 'comments_to_agent', type: 'text', isNullable: true },
          { name: 'leg_id', type: 'int' },
          { name: 'intel_status', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('legs');
  }
}
