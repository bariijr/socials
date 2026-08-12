"""initial schema

Revision ID: 2bccf06f6bc7
Revises:
Create Date: 2026-08-09 12:44:36.836355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2bccf06f6bc7'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: hand-trimmed after autogenerate. The postgis/postgis image's
    # CREATE EXTENSION postgis also provisions the tiger_geocoder /
    # topology system tables (spatial_ref_sys, tiger.*, topology.*); those
    # are NOT part of our schema and autogenerate proposed dropping them.
    # They are intentionally excluded here — only our 18 reference-data
    # tables are created/dropped by this migration.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table('aircraft_performance',
    sa.Column('icao_type', sa.String(length=10), nullable=False),
    sa.Column('manufacturer', sa.String(length=200), nullable=True),
    sa.Column('model_series', sa.String(length=200), nullable=True),
    sa.Column('max_range_nm', sa.Float(), nullable=True),
    sa.Column('cruise_tas_kts', sa.Float(), nullable=True),
    sa.Column('fuel_burn_kg_per_hr', sa.Float(), nullable=True),
    sa.Column('max_pax', sa.Integer(), nullable=True),
    sa.Column('mtow_kg', sa.Float(), nullable=True),
    sa.Column('service_ceiling_ft', sa.Float(), nullable=True),
    sa.Column('reserve_safety_margin', sa.Float(), nullable=True),
    sa.Column('source', sa.String(length=500), nullable=True),
    sa.Column('verified', sa.Boolean(), nullable=False),
    sa.Column('verified_by', sa.String(length=200), nullable=True),
    sa.Column('verified_on', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.PrimaryKeyConstraint('icao_type')
    )
    op.create_table('audit_log',
    sa.Column('actor_user_id', sa.UUID(), nullable=True),
    sa.Column('actor_email', sa.String(length=300), nullable=True),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('entity_type', sa.String(length=100), nullable=False),
    sa.Column('entity_id', sa.String(length=100), nullable=False),
    sa.Column('from_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('to_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('reason', sa.String(length=1000), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('countries',
    sa.Column('iso3', sa.String(length=3), nullable=False),
    sa.Column('iso2', sa.String(length=2), nullable=True),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('calling_code', sa.String(length=10), nullable=True),
    sa.Column('caa_name', sa.String(length=300), nullable=True),
    sa.Column('region', sa.String(length=100), nullable=True),
    sa.Column('overflight_permit_required', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('landing_permit_required', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('permit_flags_source', sa.String(length=500), nullable=True),
    sa.Column('permit_flags_verified_by', sa.String(length=200), nullable=True),
    sa.Column('permit_flags_verified_on', sa.Date(), nullable=True),
    sa.Column('standard_lead_time_hours', sa.Float(), nullable=True),
    sa.Column('lead_time_source', sa.String(length=500), nullable=True),
    sa.Column('lead_time_verified_by', sa.String(length=200), nullable=True),
    sa.Column('lead_time_verified_on', sa.Date(), nullable=True),
    sa.Column('ground_handling_policy', sa.Enum('MANDATORY', 'NOT_MANDATORY', 'SELF_HANDLING_PERMITTED', 'VERIFY', name='ground_handling_policy'), server_default='VERIFY', nullable=False),
    sa.Column('ground_handling_source', sa.String(length=500), nullable=True),
    sa.Column('ground_handling_verified_by', sa.String(length=200), nullable=True),
    sa.Column('ground_handling_verified_on', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('iso3'),
    sa.UniqueConstraint('iso2')
    )
    op.create_table('fir_boundaries',
    sa.Column('icao_fir_code', sa.String(length=10), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='MULTIPOLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('source', sa.String(length=300), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    # geoalchemy2 auto-creates the GiST spatial index for Geometry columns
    # (spatial_index=True default) as a DDL event when the table is
    # created, so no explicit create_index for `geom` here.
    op.create_index(op.f('ix_fir_boundaries_icao_fir_code'), 'fir_boundaries', ['icao_fir_code'], unique=False)
    op.create_table('message_templates',
    sa.Column('template_key', sa.String(length=100), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('message_type', sa.String(length=100), nullable=False),
    sa.Column('recipient_role', sa.String(length=100), nullable=False),
    sa.Column('channel', sa.Enum('EMAIL', 'SITA', 'AFTN', 'FAX', 'PORTAL', name='message_template_channel'), nullable=False),
    sa.Column('subject_line', sa.String(length=500), nullable=True),
    sa.Column('body', sa.String(), nullable=False),
    sa.Column('footer_block', sa.String(), nullable=True),
    sa.Column('required_attachments', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('template_version', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_message_templates_template_key'), 'message_templates', ['template_key'], unique=False)
    op.create_table('operators',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('name', sa.String(length=300), nullable=True),
    sa.Column('aoc_number', sa.String(length=100), nullable=True),
    sa.Column('icao_designator', sa.String(length=10), nullable=True),
    sa.Column('iata_designator', sa.String(length=10), nullable=True),
    sa.Column('home_base_icao', sa.String(length=4), nullable=True),
    sa.Column('contact_name', sa.String(length=200), nullable=True),
    sa.Column('contact_phone', sa.String(length=50), nullable=True),
    sa.Column('occ_email', sa.String(length=300), nullable=True),
    sa.Column('billing_email', sa.String(length=300), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=True),
    sa.Column('tax_id', sa.String(length=100), nullable=True),
    sa.Column('credit_limit_minor_units', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'SUSPENDED', 'ARCHIVED', name='operator_status'), nullable=False),
    sa.Column('preferred_channel', sa.Enum('EMAIL', 'SITA', 'AFTN', 'FAX', 'PORTAL', name='operator_preferred_channel'), nullable=True),
    sa.Column('messaging_to', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('messaging_cc', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('sita_address', sa.String(length=20), nullable=True),
    sa.Column('aftn_address', sa.String(length=20), nullable=True),
    sa.Column('message_format', sa.Enum('PLAIN_TEXT_UPPERCASE', 'PLAIN_TEXT', 'HTML', name='operator_message_format'), nullable=True),
    sa.Column('sending_team_signature', sa.String(length=500), nullable=True),
    sa.Column('quarantined', sa.Boolean(), nullable=False),
    sa.Column('quarantine_reason', sa.String(length=300), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_table('service_catalogue',
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=True),
    sa.Column('category', sa.Enum('PERMIT', 'GROUND', name='service_category'), nullable=False),
    sa.Column('ground_grid_order', sa.Integer(), nullable=True),
    sa.Column('level', sa.Enum('SERVICE', 'SUB_SERVICE', name='service_level'), nullable=False),
    sa.Column('parent_service_id', sa.UUID(), nullable=True),
    sa.Column('mapping_audit', sa.String(length=500), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['parent_service_id'], ['service_catalogue.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('settings',
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('value', sa.String(length=500), nullable=False),
    sa.Column('value_type', sa.String(length=20), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_table('vendors',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('service_scope', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('preferred_channel', sa.Enum('EMAIL', 'SITA', 'AFTN', 'FAX', 'PORTAL', name='vendor_preferred_channel'), nullable=True),
    sa.Column('messaging_to', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('messaging_cc', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('sita_address', sa.String(length=20), nullable=True),
    sa.Column('aftn_address', sa.String(length=20), nullable=True),
    sa.Column('message_format', sa.Enum('PLAIN_TEXT_UPPERCASE', 'PLAIN_TEXT', 'HTML', name='vendor_message_format'), nullable=True),
    sa.Column('sending_team_signature', sa.String(length=500), nullable=True),
    sa.Column('questionnaire_sent_on', sa.Date(), nullable=True),
    sa.Column('questionnaire_returned_on', sa.Date(), nullable=True),
    sa.Column('questionnaire_answers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('capability_status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', name='vendor_capability_status'), nullable=False),
    sa.Column('approved_by', sa.String(length=200), nullable=True),
    sa.Column('approved_on', sa.Date(), nullable=True),
    sa.Column('preference_rank', sa.Integer(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_table('aircraft',
    sa.Column('registration', sa.String(length=20), nullable=False),
    sa.Column('icao_type', sa.String(length=10), nullable=False),
    sa.Column('manufacturer', sa.String(length=200), nullable=True),
    sa.Column('model_series', sa.String(length=200), nullable=True),
    sa.Column('serial_number', sa.String(length=100), nullable=True),
    sa.Column('home_base_icao', sa.String(length=4), nullable=True),
    sa.Column('mtow_kg', sa.Float(), nullable=True),
    sa.Column('max_pax', sa.Integer(), nullable=True),
    sa.Column('operator_id', sa.UUID(), nullable=False),
    sa.Column('cofa_expiry', sa.Date(), nullable=True),
    sa.Column('insurance_expiry', sa.Date(), nullable=True),
    sa.Column('total_hours', sa.Float(), nullable=True),
    sa.Column('total_landings', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'GROUNDED', 'ARCHIVED', name='aircraft_status'), nullable=False),
    sa.Column('quarantined', sa.Boolean(), nullable=False),
    sa.Column('quarantine_reason', sa.String(length=300), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['icao_type'], ['aircraft_performance.icao_type'], ),
    sa.ForeignKeyConstraint(['operator_id'], ['operators.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('registration')
    )
    op.create_table('airports',
    sa.Column('icao', sa.String(length=4), nullable=False),
    sa.Column('iata', sa.String(length=3), nullable=True),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('city', sa.String(length=200), nullable=True),
    sa.Column('country_iso3', sa.String(length=3), nullable=True),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('elevation_ft', sa.Float(), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=True),
    sa.Column('airport_type', sa.String(length=50), nullable=True),
    sa.Column('is_airport_of_entry', sa.Boolean(), nullable=True),
    sa.Column('ppr_required', sa.Boolean(), nullable=True),
    sa.Column('curfew', sa.String(length=300), nullable=True),
    sa.Column('longest_runway_ft', sa.Float(), nullable=True),
    sa.Column('runway_surface', sa.String(length=100), nullable=True),
    sa.Column('fuel_grades', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('operating_hours', sa.String(length=200), nullable=True),
    sa.Column('handler_notes', sa.String(length=1000), nullable=True),
    sa.Column('ops_data_source', sa.String(length=500), nullable=True),
    sa.Column('ops_data_verified_by', sa.String(length=200), nullable=True),
    sa.Column('ops_data_verified_on', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3'], ),
    sa.PrimaryKeyConstraint('icao')
    )
    op.create_index(op.f('ix_airports_country_iso3'), 'airports', ['country_iso3'], unique=False)
    op.create_table('clients',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('operator_id', sa.UUID(), nullable=False),
    sa.Column('bill_to_legal_name', sa.String(length=300), nullable=False),
    sa.Column('address', sa.String(length=500), nullable=True),
    sa.Column('tax_vat_number', sa.String(length=100), nullable=True),
    sa.Column('billing_contact_name', sa.String(length=200), nullable=True),
    sa.Column('billing_contact_email', sa.String(length=300), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=True),
    sa.Column('payment_terms', sa.String(length=200), nullable=True),
    sa.Column('credit_limit_minor_units', sa.Integer(), nullable=True),
    sa.Column('preferred_channel', sa.Enum('EMAIL', 'SITA', 'AFTN', 'FAX', 'PORTAL', name='client_preferred_channel'), nullable=True),
    sa.Column('messaging_to', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('messaging_cc', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('sita_address', sa.String(length=20), nullable=True),
    sa.Column('aftn_address', sa.String(length=20), nullable=True),
    sa.Column('message_format', sa.Enum('PLAIN_TEXT_UPPERCASE', 'PLAIN_TEXT', 'HTML', name='client_message_format'), nullable=True),
    sa.Column('sending_team_signature', sa.String(length=500), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['operator_id'], ['operators.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_table('country_geometry',
    sa.Column('iso3', sa.String(length=3), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='MULTIPOLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('source', sa.String(length=300), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['iso3'], ['countries.iso3'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('iso3')
    )
    op.create_table('country_requirements',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('country_iso3', sa.String(length=3), nullable=False),
    sa.Column('request_type', sa.String(length=100), nullable=False),
    sa.Column('required_forms', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('required_documents', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('lead_time_hours', sa.Float(), nullable=True),
    sa.Column('authority_working_hours', sa.String(length=200), nullable=True),
    sa.Column('accepted_channels', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('fee_structure', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('local_agent_required', sa.Boolean(), nullable=True),
    sa.Column('direct_caa_account_possible', sa.Boolean(), nullable=True),
    sa.Column('known_quirks', sa.String(length=2000), nullable=True),
    sa.Column('source', sa.String(length=500), nullable=True),
    sa.Column('verified_by', sa.String(length=200), nullable=True),
    sa.Column('verified_on', sa.Date(), nullable=True),
    sa.Column('review_due', sa.Date(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_index(op.f('ix_country_requirements_country_iso3'), 'country_requirements', ['country_iso3'], unique=False)
    op.create_table('vendor_coverage_countries',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('vendor_id', sa.UUID(), nullable=False),
    sa.Column('country_iso3', sa.String(length=3), nullable=False),
    sa.Column('has_caa_direct_account', sa.Boolean(), nullable=False),
    sa.Column('service_scope', sa.ARRAY(sa.String()), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3'], ),
    sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_index(op.f('ix_vendor_coverage_countries_country_iso3'), 'vendor_coverage_countries', ['country_iso3'], unique=False)
    op.create_table('visa_matrix',
    sa.Column('country_iso3', sa.String(length=3), nullable=False),
    sa.Column('nationality_iso3', sa.String(length=3), nullable=False),
    sa.Column('requirement', sa.Enum('NOT_REQUIRED', 'REQUIRED', 'VISA_ON_ARRIVAL', 'EVISA', 'TRANSIT_ONLY', 'TIWB', name='visa_matrix_requirement'), nullable=False),
    sa.Column('visa_type', sa.String(length=100), nullable=True),
    sa.Column('lead_time_days', sa.Integer(), nullable=True),
    sa.Column('max_stay_days', sa.Integer(), nullable=True),
    sa.Column('conditions', sa.String(length=1000), nullable=True),
    sa.Column('source', sa.String(length=500), nullable=True),
    sa.Column('verified_by', sa.String(length=200), nullable=True),
    sa.Column('verified_on', sa.Date(), nullable=True),
    sa.Column('expires_on', sa.Date(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('country_iso3', 'nationality_iso3', name='uq_visa_matrix_cell')
    )
    op.create_index(op.f('ix_visa_matrix_country_iso3'), 'visa_matrix', ['country_iso3'], unique=False)
    op.create_index(op.f('ix_visa_matrix_nationality_iso3'), 'visa_matrix', ['nationality_iso3'], unique=False)
    op.create_table('users',
    sa.Column('email', sa.String(length=300), nullable=False),
    sa.Column('full_name', sa.String(length=200), nullable=False),
    sa.Column('hashed_password', sa.String(length=300), nullable=False),
    sa.Column('role', sa.Enum('SUPER_ADMIN', 'OPERATIONS_SPECIALIST', 'AUDITOR', 'CLIENT_MODIFY', 'CLIENT_VIEW', 'FINANCE', name='user_role'), nullable=False),
    sa.Column('operator_id', sa.UUID(), nullable=True),
    sa.Column('client_id', sa.UUID(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('mfa_enabled', sa.Boolean(), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['operator_id'], ['operators.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('vendor_coverage_airports',
    sa.Column('source_ref', sa.String(length=50), nullable=True),
    sa.Column('vendor_id', sa.UUID(), nullable=False),
    sa.Column('icao', sa.String(length=4), nullable=False),
    sa.Column('is_primary_handler', sa.Boolean(), nullable=False),
    sa.Column('fbo_name', sa.String(length=300), nullable=True),
    sa.Column('sita', sa.String(length=20), nullable=True),
    sa.Column('aftn', sa.String(length=20), nullable=True),
    sa.Column('vhf', sa.String(length=50), nullable=True),
    sa.Column('contacts', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['icao'], ['airports.icao'], ),
    sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_ref')
    )
    op.create_index(op.f('ix_vendor_coverage_airports_icao'), 'vendor_coverage_airports', ['icao'], unique=False)
    op.create_table('visa_rules',
    sa.Column('country_iso3', sa.String(length=3), nullable=False),
    sa.Column('nationality_iso3', sa.String(length=3), nullable=False),
    sa.Column('airport_icao', sa.String(length=4), nullable=True),
    sa.Column('requirement', sa.Enum('NOT_REQUIRED', 'REQUIRED', 'VISA_ON_ARRIVAL', 'EVISA', 'TRANSIT_ONLY', 'TIWB', name='visa_rule_requirement'), nullable=False),
    sa.Column('visa_type', sa.String(length=100), nullable=True),
    sa.Column('lead_time_days', sa.Integer(), nullable=True),
    sa.Column('max_stay_days', sa.Integer(), nullable=True),
    sa.Column('conditions', sa.String(length=1000), nullable=True),
    sa.Column('source', sa.String(length=500), nullable=True),
    sa.Column('verified_by', sa.String(length=200), nullable=True),
    sa.Column('verified_on', sa.Date(), nullable=True),
    sa.Column('expires_on', sa.Date(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['airport_icao'], ['airports.icao'], ),
    sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_visa_rules_airport_icao'), 'visa_rules', ['airport_icao'], unique=False)
    op.create_index(op.f('ix_visa_rules_country_iso3'), 'visa_rules', ['country_iso3'], unique=False)
    op.create_index(op.f('ix_visa_rules_nationality_iso3'), 'visa_rules', ['nationality_iso3'], unique=False)


def downgrade() -> None:
    # Reverse dependency order. Dropping a table also drops its indexes,
    # so no explicit drop_index calls are needed here.
    op.drop_table('visa_rules')
    op.drop_table('vendor_coverage_airports')
    op.drop_table('users')
    op.drop_table('visa_matrix')
    op.drop_table('vendor_coverage_countries')
    op.drop_table('country_requirements')
    op.drop_table('country_geometry')
    op.drop_table('clients')
    op.drop_table('airports')
    op.drop_table('aircraft')
    op.drop_table('vendors')
    op.drop_table('settings')
    op.drop_table('service_catalogue')
    op.drop_table('operators')
    op.drop_table('message_templates')
    op.drop_table('fir_boundaries')
    op.drop_table('countries')
    op.drop_table('audit_log')
    op.drop_table('aircraft_performance')

    for enum_name in (
        'visa_rule_requirement', 'visa_matrix_requirement', 'user_role',
        'client_message_format', 'client_preferred_channel', 'aircraft_status',
        'vendor_capability_status', 'vendor_message_format', 'vendor_preferred_channel',
        'service_level', 'service_category', 'operator_message_format',
        'operator_preferred_channel', 'operator_status', 'message_template_channel',
        'ground_handling_policy',
    ):
        op.execute(f'DROP TYPE IF EXISTS {enum_name}')
