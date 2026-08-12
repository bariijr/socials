"""trip_legs.constraints (avoid/include states + FIRs as submitted)

Revision ID: e2b8f4a1c6d9
Revises: c7d4e1b9f6a3
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e2b8f4a1c6d9'
down_revision: Union[str, None] = 'c7d4e1b9f6a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'trip_legs',
        sa.Column('constraints', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
    )
    op.alter_column('trip_legs', 'constraints', server_default=None)


def downgrade() -> None:
    op.drop_column('trip_legs', 'constraints')
