"""countries.permit_validity_amount/unit + provenance triple

Revision ID: b1d9f4e6a2c8
Revises: a8e2c5f9b3d7
Create Date: 2026-08-12 00:00:04.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b1d9f4e6a2c8'
down_revision: Union[str, None] = 'a8e2c5f9b3d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    permit_validity_unit = postgresql.ENUM('HOURS', 'DAYS', 'WEEKS', 'MONTHS', name='permit_validity_unit')
    permit_validity_unit.create(op.get_bind(), checkfirst=True)

    op.add_column('countries', sa.Column('permit_validity_amount', sa.Float(), nullable=True))
    op.add_column(
        'countries',
        sa.Column(
            'permit_validity_unit',
            postgresql.ENUM('HOURS', 'DAYS', 'WEEKS', 'MONTHS', name='permit_validity_unit', create_type=False),
            nullable=True,
        ),
    )
    op.add_column('countries', sa.Column('permit_validity_source', sa.String(length=500), nullable=True))
    op.add_column('countries', sa.Column('permit_validity_verified_by', sa.String(length=200), nullable=True))
    op.add_column('countries', sa.Column('permit_validity_verified_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('countries', 'permit_validity_verified_on')
    op.drop_column('countries', 'permit_validity_verified_by')
    op.drop_column('countries', 'permit_validity_source')
    op.drop_column('countries', 'permit_validity_unit')
    op.drop_column('countries', 'permit_validity_amount')
    bind = op.get_bind()
    postgresql.ENUM(name='permit_validity_unit').drop(bind, checkfirst=True)
