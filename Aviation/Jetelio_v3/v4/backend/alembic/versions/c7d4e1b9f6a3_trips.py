"""trips and trip_legs (Phase 3 minimal pull-forward)

Revision ID: c7d4e1b9f6a3
Revises: a1f3c9e7d2b4
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c7d4e1b9f6a3'
down_revision: Union[str, None] = 'a1f3c9e7d2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    trip_status = postgresql.ENUM('ENQUIRY', 'CONFIRMED', 'CANCELLED', name='trip_status')
    trip_status.create(op.get_bind())
    trip_source = postgresql.ENUM('PUBLIC_FEASIBILITY_IQ', 'INTERNAL', name='trip_source')
    trip_source.create(op.get_bind())

    op.create_table(
        'trips',
        sa.Column('status', postgresql.ENUM('ENQUIRY', 'CONFIRMED', 'CANCELLED', name='trip_status', create_type=False), nullable=False),
        sa.Column('source', postgresql.ENUM('PUBLIC_FEASIBILITY_IQ', 'INTERNAL', name='trip_source', create_type=False), nullable=False),
        sa.Column('requested_by_name', sa.String(length=200), nullable=True),
        sa.Column('requested_by_email', sa.String(length=300), nullable=True),
        sa.Column('requested_by_phone', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.String(length=2000), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'trip_legs',
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('leg_index', sa.Integer(), nullable=False),
        sa.Column('dep_icao', sa.String(length=4), nullable=False),
        sa.Column('arr_icao', sa.String(length=4), nullable=False),
        sa.Column('aircraft_icao_type', sa.String(length=10), nullable=False),
        sa.Column('reference_datetime', sa.DateTime(timezone=True), nullable=False),
        sa.Column('persons', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('verdict', sa.String(length=30), nullable=False),
        sa.Column('rule_engine_version', sa.String(length=20), nullable=False),
        sa.Column('computed_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dep_icao'], ['airports.icao']),
        sa.ForeignKeyConstraint(['arr_icao'], ['airports.icao']),
        sa.ForeignKeyConstraint(['aircraft_icao_type'], ['aircraft_performance.icao_type']),
    )
    op.create_index(op.f('ix_trip_legs_trip_id'), 'trip_legs', ['trip_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_trip_legs_trip_id'), table_name='trip_legs')
    op.drop_table('trip_legs')
    op.drop_table('trips')
    postgresql.ENUM(name='trip_source').drop(op.get_bind())
    postgresql.ENUM(name='trip_status').drop(op.get_bind())
