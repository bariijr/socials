"""trips.operator_airline_name (free-text, public FIQ has no DB-linked autofill)

Revision ID: e5c2a8b4f1d6
Revises: d8a1f4b7c3e9
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5c2a8b4f1d6'
down_revision: Union[str, None] = 'd8a1f4b7c3e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trips', sa.Column('operator_airline_name', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('trips', 'operator_airline_name')
