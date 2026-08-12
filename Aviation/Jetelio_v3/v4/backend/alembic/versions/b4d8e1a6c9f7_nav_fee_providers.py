"""nav_fee_providers (per-FIR ANS fee schedule reference data)

Revision ID: b4d8e1a6c9f7
Revises: f3a9c2e8b5d1
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4d8e1a6c9f7'
down_revision: Union[str, None] = 'f3a9c2e8b5d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nav_fee_providers',
        sa.Column('fir_code', sa.String(length=10), nullable=False),
        sa.Column('provider_name', sa.String(length=200), nullable=False),
        sa.Column('country', sa.String(length=200), nullable=True),
        sa.Column('formula', sa.String(length=30), nullable=False),
        sa.Column('base_rate', sa.Float(), nullable=False),
        sa.Column('minimum_fee', sa.Float(), nullable=False),
        sa.Column('maximum_fee', sa.Float(), nullable=True),
        sa.Column('vat_rate', sa.Float(), nullable=False),
        sa.Column('applies_50km_deduction', sa.Boolean(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('source', sa.String(length=500), nullable=True),
        sa.Column('verified_by', sa.String(length=200), nullable=True),
        sa.Column('verified_on', sa.Date(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('fir_code'),
    )
    op.create_index(op.f('ix_nav_fee_providers_fir_code'), 'nav_fee_providers', ['fir_code'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_nav_fee_providers_fir_code'), table_name='nav_fee_providers')
    op.drop_table('nav_fee_providers')
