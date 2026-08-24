import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddCompatibilityGrouping1756425600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'requirement_legs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'requirement_id', type: 'uuid' },
          { name: 'leg_id', type: 'uuid' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    // One row per existing Requirement — every request today covers exactly one leg,
    // so this backfill is lossless.
    await queryRunner.query(`
      INSERT INTO requirement_legs (id, requirement_id, leg_id, created_at)
      SELECT gen_random_uuid(), id, leg_id, now()
      FROM requirements
    `);

    await queryRunner.query(`ALTER TABLE requirements DROP COLUMN leg_id`);
    await queryRunner.addColumn(
      'requirements',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );

    const countryRequirementsTable = await queryRunner.getTable('country_requirements');
    const countryUnique = countryRequirementsTable!.uniques.find((u) => u.columnNames.includes('country'));
    if (countryUnique) {
      await queryRunner.dropUniqueConstraint('country_requirements', countryUnique);
    }
    await queryRunner.addColumn(
      'country_requirements',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );
    // Duplicate every existing (now-OVERFLIGHT-defaulted) row into a LANDING row with
    // identical starting values — real per-type values are a coordinator follow-up,
    // same as the existing seed data's placeholder values already are today.
    await queryRunner.query(`
      INSERT INTO country_requirements (id, country, service_type, lead_time_hours, working_days_only, tolerance_hours, required_docs, submission_email, created_at, updated_at)
      SELECT gen_random_uuid(), country, 'LANDING', lead_time_hours, working_days_only, tolerance_hours, required_docs, submission_email, created_at, updated_at
      FROM country_requirements
      WHERE service_type = 'OVERFLIGHT'
    `);

    await queryRunner.addColumn(
      'form_templates',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );
    await queryRunner.query(`
      INSERT INTO form_templates (id, country, service_type, name, body_template, merge_fields, created_at, updated_at)
      SELECT gen_random_uuid(), country, 'LANDING', name, body_template, merge_fields, created_at, updated_at
      FROM form_templates
      WHERE service_type = 'OVERFLIGHT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM form_templates WHERE service_type = 'LANDING'`);
    await queryRunner.dropColumn('form_templates', 'service_type');

    await queryRunner.query(`DELETE FROM country_requirements WHERE service_type = 'LANDING'`);
    await queryRunner.dropColumn('country_requirements', 'service_type');
    await queryRunner.query(`ALTER TABLE country_requirements ADD CONSTRAINT UQ_country_requirements_country UNIQUE (country)`);

    // Lossy: a Requirement that was actually merged (>1 leg) loses every leg but the
    // earliest-added one on rollback. Acceptable for a down() path this project has
    // never needed to run in practice.
    await queryRunner.addColumn('requirements', new TableColumn({ name: 'leg_id', type: 'uuid', isNullable: true }));
    await queryRunner.query(`
      UPDATE requirements SET leg_id = sub.leg_id
      FROM (
        SELECT DISTINCT ON (requirement_id) requirement_id, leg_id
        FROM requirement_legs
        ORDER BY requirement_id, created_at ASC
      ) sub
      WHERE requirements.id = sub.requirement_id
    `);
    await queryRunner.query(`ALTER TABLE requirements ALTER COLUMN leg_id SET NOT NULL`);
    await queryRunner.dropColumn('requirements', 'service_type');

    await queryRunner.dropTable('requirement_legs');
  }
}
