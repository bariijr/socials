"""permit_fee_providers (CAA fee + nafisat reference data, per country/permit-type)

Revision ID: c9e4f7a2d5b8
Revises: a3d7e2f9b6c1
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c9e4f7a2d5b8'
down_revision: Union[str, None] = 'a3d7e2f9b6c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'permit_fee_providers',
        sa.Column('country_iso3', sa.String(length=3), nullable=False),
        sa.Column('permit_type', sa.String(length=20), nullable=False),
        sa.Column('fee_category', sa.String(length=20), nullable=False),
        sa.Column('provider_name', sa.String(length=200), nullable=False),
        sa.Column('formula', sa.String(length=30), nullable=False),
        sa.Column('base_rate', sa.Float(), nullable=False),
        sa.Column('minimum_fee', sa.Float(), nullable=False),
        sa.Column('maximum_fee', sa.Float(), nullable=True),
        sa.Column('vat_rate', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('source', sa.String(length=500), nullable=True),
        sa.Column('verified_by', sa.String(length=200), nullable=True),
        sa.Column('verified_on', sa.Date(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('country_iso3', 'permit_type', 'fee_category', name='uq_permit_fee_provider_country_type_category'),
    )
    op.create_index(op.f('ix_permit_fee_providers_country_iso3'), 'permit_fee_providers', ['country_iso3'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_permit_fee_providers_country_iso3'), table_name='permit_fee_providers')
    op.drop_table('permit_fee_providers')
