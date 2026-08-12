"""route cache (Engine 1)

Revision ID: a1f3c9e7d2b4
Revises: 2bccf06f6bc7
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1f3c9e7d2b4'
down_revision: Union[str, None] = '2bccf06f6bc7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'route_cache',
        sa.Column('dep_icao', sa.String(length=4), nullable=False),
        sa.Column('arr_icao', sa.String(length=4), nullable=False),
        sa.Column('rule_engine_version', sa.String(length=20), nullable=False),
        sa.Column('distance_nm', sa.Float(), nullable=False),
        sa.Column('sample_point_count', sa.Integer(), nullable=False),
        sa.Column('states', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('firs', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dep_icao', 'arr_icao', 'rule_engine_version', name='uq_route_cache_leg_version'),
    )
    op.create_index(op.f('ix_route_cache_dep_icao'), 'route_cache', ['dep_icao'], unique=False)
    op.create_index(op.f('ix_route_cache_arr_icao'), 'route_cache', ['arr_icao'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_route_cache_arr_icao'), table_name='route_cache')
    op.drop_index(op.f('ix_route_cache_dep_icao'), table_name='route_cache')
    op.drop_table('route_cache')
