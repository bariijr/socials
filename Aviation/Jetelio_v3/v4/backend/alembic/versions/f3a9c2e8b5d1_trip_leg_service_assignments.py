"""trip_legs.service_assignments (provider per service line item)

Revision ID: f3a9c2e8b5d1
Revises: e2b8f4a1c6d9
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3a9c2e8b5d1'
down_revision: Union[str, None] = 'e2b8f4a1c6d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'trip_legs',
        sa.Column('service_assignments', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
    )
    op.alter_column('trip_legs', 'service_assignments', server_default=None)


def downgrade() -> None:
    op.drop_column('trip_legs', 'service_assignments')
