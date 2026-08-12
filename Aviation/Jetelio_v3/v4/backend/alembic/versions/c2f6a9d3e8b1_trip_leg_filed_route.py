"""trip_legs.filed_route (free-text filed route string, display-only)

Revision ID: c2f6a9d3e8b1
Revises: b4d8e1a6c9f7
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c2f6a9d3e8b1'
down_revision: Union[str, None] = 'b4d8e1a6c9f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trip_legs', sa.Column('filed_route', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column('trip_legs', 'filed_route')
