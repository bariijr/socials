"""vendor_contacts + service_delivery_configs + confirmation_routing_configs

Revision ID: a8e2c5f9b3d7
Revises: f4c8e1a6d3b9
Create Date: 2026-08-12 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a8e2c5f9b3d7'
down_revision: Union[str, None] = 'f4c8e1a6d3b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DELIVERY_CHANNEL_VALUES = ('EMAIL', 'PHONE', 'FAX', 'SMS', 'WHATSAPP', 'PORTAL', 'SITA', 'ARINC', 'AFTN')
CONFIRMATION_TARGET_ROLE_VALUES = ('CREW', 'DISPATCH', 'OTHER')


def upgrade() -> None:
    bind = op.get_bind()
    delivery_channel = postgresql.ENUM(*DELIVERY_CHANNEL_VALUES, name='delivery_channel')
    delivery_channel.create(bind, checkfirst=True)
    confirmation_target_role = postgresql.ENUM(*CONFIRMATION_TARGET_ROLE_VALUES, name='confirmation_target_role')
    confirmation_target_role.create(bind, checkfirst=True)

    op.create_table(
        'vendor_contacts',
        sa.Column('vendor_id', sa.UUID(), nullable=False),
        sa.Column('channel', postgresql.ENUM(*DELIVERY_CHANNEL_VALUES, name='delivery_channel', create_type=False), nullable=False),
        sa.Column('contact_value', sa.String(length=300), nullable=False),
        sa.Column('contact_name', sa.String(length=200), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendor_contacts_vendor_id'), 'vendor_contacts', ['vendor_id'], unique=False)

    op.create_table(
        'service_delivery_configs',
        sa.Column('leg_id', sa.UUID(), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('operator_id', sa.UUID(), nullable=True),
        sa.Column('service_code', sa.String(length=20), nullable=True),
        sa.Column('vendor_id', sa.UUID(), nullable=False),
        sa.Column('message_template_id', sa.UUID(), nullable=True),
        sa.Column(
            'delivery_channels',
            postgresql.ARRAY(postgresql.ENUM(*DELIVERY_CHANNEL_VALUES, name='delivery_channel', create_type=False)),
            nullable=False,
        ),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['leg_id'], ['trip_legs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['operator_id'], ['operators.id']),
        sa.ForeignKeyConstraint(['service_code'], ['service_catalogue.code']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.ForeignKeyConstraint(['message_template_id'], ['message_templates.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'confirmation_routing_configs',
        sa.Column('leg_id', sa.UUID(), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('operator_id', sa.UUID(), nullable=True),
        sa.Column('target_role', postgresql.ENUM(*CONFIRMATION_TARGET_ROLE_VALUES, name='confirmation_target_role', create_type=False), nullable=False),
        sa.Column('target_contact_override', sa.String(length=300), nullable=True),
        sa.Column(
            'confirmation_channels',
            postgresql.ARRAY(postgresql.ENUM(*DELIVERY_CHANNEL_VALUES, name='delivery_channel', create_type=False)),
            nullable=False,
        ),
        sa.Column('message_template_id', sa.UUID(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['leg_id'], ['trip_legs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['operator_id'], ['operators.id']),
        sa.ForeignKeyConstraint(['message_template_id'], ['message_templates.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('confirmation_routing_configs')
    op.drop_table('service_delivery_configs')
    op.drop_index(op.f('ix_vendor_contacts_vendor_id'), table_name='vendor_contacts')
    op.drop_table('vendor_contacts')
    bind = op.get_bind()
    postgresql.ENUM(name='confirmation_target_role').drop(bind, checkfirst=True)
    postgresql.ENUM(name='delivery_channel').drop(bind, checkfirst=True)
