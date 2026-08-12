"""Trip snapshot fields (serial/colors/ops_type/flight_purpose/created_by/
updated_by) and TripLeg refinements (registration override, real editable
arrival_datetime, leg_type, leg_status, updated_by)

Revision ID: f7b3e9c2a5d8
Revises: e5c2a8b4f1d6
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7b3e9c2a5d8'
down_revision: Union[str, None] = 'e5c2a8b4f1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TRIP_OPS_TYPE = sa.Enum('PRIVATE', 'MILITARY', 'CHARTER', 'CARGO', 'MEDEVAC', 'OTHER', name='trip_ops_type')
TRIP_FLIGHT_PURPOSE = sa.Enum('BUSINESS', 'TOURISM', 'FERRY', 'REPOSITION', 'OTHER', name='trip_flight_purpose')
LEG_TYPE = sa.Enum('PRIMARY', 'ALTERNATE', name='trip_leg_type')
LEG_STATUS = sa.Enum('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', name='trip_leg_status')


def upgrade() -> None:
    bind = op.get_bind()
    TRIP_OPS_TYPE.create(bind, checkfirst=True)
    TRIP_FLIGHT_PURPOSE.create(bind, checkfirst=True)
    LEG_TYPE.create(bind, checkfirst=True)
    LEG_STATUS.create(bind, checkfirst=True)

    op.add_column('trips', sa.Column('serial_number', sa.String(length=100), nullable=True))
    op.add_column('trips', sa.Column('colors', sa.String(length=200), nullable=True))
    op.add_column('trips', sa.Column('ops_type', TRIP_OPS_TYPE, nullable=True))
    op.add_column('trips', sa.Column('flight_purpose', TRIP_FLIGHT_PURPOSE, nullable=True))
    # No FK to users.id — matches AuditLog.actor_user_id's existing pattern
    # (app/models/audit.py): a JWT's user id is valid by virtue of having
    # been issued at login, not by a live DB row existing at write time.
    op.add_column('trips', sa.Column('created_by', sa.UUID(), nullable=True))
    op.add_column('trips', sa.Column('updated_by', sa.UUID(), nullable=True))

    # arrival_datetime: backfill existing rows from reference_datetime before
    # setting NOT NULL — every leg already has a resolved departure instant,
    # so a same-instant placeholder is a safe backfill (real values are
    # recomputed on the next edit; nothing reads this as authoritative for
    # a leg that hasn't been touched since this migration).
    op.add_column('trip_legs', sa.Column('arrival_datetime', sa.DateTime(timezone=True), nullable=True))
    op.execute('UPDATE trip_legs SET arrival_datetime = reference_datetime WHERE arrival_datetime IS NULL')
    op.alter_column('trip_legs', 'arrival_datetime', nullable=False)

    op.add_column('trip_legs', sa.Column('registration', sa.String(length=20), nullable=True))
    op.add_column('trip_legs', sa.Column('leg_type', LEG_TYPE, nullable=False, server_default='PRIMARY'))
    op.alter_column('trip_legs', 'leg_type', server_default=None)
    op.add_column('trip_legs', sa.Column('leg_status', LEG_STATUS, nullable=False, server_default='PENDING'))
    op.alter_column('trip_legs', 'leg_status', server_default=None)
    op.add_column('trip_legs', sa.Column('updated_by', sa.UUID(), nullable=True))


def downgrade() -> None:
    op.drop_column('trip_legs', 'updated_by')
    op.drop_column('trip_legs', 'leg_status')
    op.drop_column('trip_legs', 'leg_type')
    op.drop_column('trip_legs', 'registration')
    op.drop_column('trip_legs', 'arrival_datetime')

    op.drop_column('trips', 'updated_by')
    op.drop_column('trips', 'created_by')
    op.drop_column('trips', 'flight_purpose')
    op.drop_column('trips', 'ops_type')
    op.drop_column('trips', 'colors')
    op.drop_column('trips', 'serial_number')

    bind = op.get_bind()
    LEG_STATUS.drop(bind, checkfirst=True)
    LEG_TYPE.drop(bind, checkfirst=True)
    TRIP_FLIGHT_PURPOSE.drop(bind, checkfirst=True)
    TRIP_OPS_TYPE.drop(bind, checkfirst=True)
