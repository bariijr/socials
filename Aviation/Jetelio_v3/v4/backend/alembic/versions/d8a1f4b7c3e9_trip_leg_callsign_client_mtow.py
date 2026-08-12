"""trip_legs.call_sign/client_id, trips.aircraft_registration/entered_mtow_kg

Revision ID: d8a1f4b7c3e9
Revises: c2f6a9d3e8b1
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8a1f4b7c3e9'
down_revision: Union[str, None] = 'c2f6a9d3e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trip_legs', sa.Column('call_sign', sa.String(length=20), nullable=True))
    op.add_column('trip_legs', sa.Column('client_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_trip_legs_client_id_clients', 'trip_legs', 'clients', ['client_id'], ['id'])

    op.add_column('trips', sa.Column('aircraft_registration', sa.String(length=20), nullable=True))
    op.add_column('trips', sa.Column('entered_mtow_kg', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('trips', 'entered_mtow_kg')
    op.drop_column('trips', 'aircraft_registration')

    op.drop_constraint('fk_trip_legs_client_id_clients', 'trip_legs', type_='foreignkey')
    op.drop_column('trip_legs', 'client_id')
    op.drop_column('trip_legs', 'call_sign')
