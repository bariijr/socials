"""trip_status lifecycle rewrite (Enquiry/Confirmed/Cancelled -> Lead/Active/
Completed/Closed/Billed/Cancelled) + trips.owner_team

Revision ID: c3f8a1e5b9d2
Revises: b1d9f4e6a2c8
Create Date: 2026-08-12 00:00:05.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3f8a1e5b9d2'
down_revision: Union[str, None] = 'b1d9f4e6a2c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trips', sa.Column('owner_team', sa.String(length=200), nullable=True))

    op.execute("ALTER TYPE trip_status RENAME TO trip_status_old")
    op.execute("CREATE TYPE trip_status AS ENUM ('LEAD', 'ACTIVE', 'COMPLETED', 'CLOSED', 'BILLED', 'CANCELLED')")
    op.execute("ALTER TABLE trips ALTER COLUMN status DROP DEFAULT")
    op.execute(
        """
        ALTER TABLE trips ALTER COLUMN status TYPE trip_status USING (
            CASE status::text
                WHEN 'ENQUIRY' THEN 'LEAD'
                WHEN 'CONFIRMED' THEN 'ACTIVE'
                WHEN 'CANCELLED' THEN 'CANCELLED'
            END
        )::trip_status
        """
    )
    op.execute("ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'LEAD'")
    op.execute("DROP TYPE trip_status_old")


def downgrade() -> None:
    op.execute("ALTER TYPE trip_status RENAME TO trip_status_new")
    op.execute("CREATE TYPE trip_status AS ENUM ('ENQUIRY', 'CONFIRMED', 'CANCELLED')")
    op.execute("ALTER TABLE trips ALTER COLUMN status DROP DEFAULT")
    op.execute(
        """
        ALTER TABLE trips ALTER COLUMN status TYPE trip_status USING (
            CASE status::text
                WHEN 'LEAD' THEN 'ENQUIRY'
                WHEN 'ACTIVE' THEN 'CONFIRMED'
                WHEN 'COMPLETED' THEN 'CONFIRMED'
                WHEN 'CLOSED' THEN 'CONFIRMED'
                WHEN 'BILLED' THEN 'CONFIRMED'
                WHEN 'CANCELLED' THEN 'CANCELLED'
            END
        )::trip_status
        """
    )
    op.execute("ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'ENQUIRY'")
    op.execute("DROP TYPE trip_status_new")

    op.drop_column('trips', 'owner_team')
