"""service_messages — comms log/thread behind a service assignment (task #102)

Revision ID: e6f3c9a2d5b7
Revises: d4e7b2f9c6a3
Create Date: 2026-08-12 00:00:07.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e6f3c9a2d5b7'
down_revision: Union[str, None] = 'd4e7b2f9c6a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # delivery_channel already exists (migration a8e2c5f9b3d7) — reused
    # here, not recreated. create_table auto-emits CREATE TYPE for
    # service_message_direction since it's the only column using it.
    op.create_table(
        'service_messages',
        sa.Column('leg_id', sa.UUID(), nullable=False),
        sa.Column('service_code', sa.String(length=20), nullable=False),
        sa.Column('icao', sa.String(length=4), nullable=False),
        sa.Column(
            'direction',
            sa.Enum('OUTBOUND', 'INBOUND', 'MANUAL_NOTE', name='service_message_direction'),
            nullable=False,
        ),
        sa.Column(
            'channel',
            postgresql.ENUM(
                'EMAIL', 'PHONE', 'FAX', 'SMS', 'WHATSAPP', 'PORTAL', 'SITA', 'ARINC', 'AFTN',
                name='delivery_channel', create_type=False,
            ),
            nullable=True,
        ),
        sa.Column('subject', sa.String(length=300), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('sent_by_user_id', sa.UUID(), nullable=True),
        sa.Column('sent_by_name', sa.String(length=200), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['leg_id'], ['trip_legs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_service_messages_leg_service_icao', 'service_messages', ['leg_id', 'service_code', 'icao'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_service_messages_leg_service_icao', table_name='service_messages')
    op.drop_table('service_messages')
    bind = op.get_bind()
    sa.Enum(name='service_message_direction').drop(bind, checkfirst=True)
