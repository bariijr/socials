"""parties + party_roles (additive grouping layer over Operator/Client/Vendor)

Revision ID: d1f6b3a9c7e2
Revises: c9e4f7a2d5b8
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd1f6b3a9c7e2'
down_revision: Union[str, None] = 'c9e4f7a2d5b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'parties',
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('legal_name', sa.String(length=300), nullable=True),
        sa.Column('country_iso3', sa.String(length=3), nullable=True),
        sa.Column('address', sa.String(length=500), nullable=True),
        sa.Column('contact_name', sa.String(length=200), nullable=True),
        sa.Column('contact_email', sa.String(length=300), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.String(length=1000), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['country_iso3'], ['countries.iso3']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'party_roles',
        sa.Column('party_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.Enum('OPERATOR', 'CLIENT', 'VENDOR', 'AGENT', 'WALK_IN', name='party_role_type'), nullable=False),
        sa.Column('operator_id', sa.UUID(), nullable=True),
        sa.Column('client_id', sa.UUID(), nullable=True),
        sa.Column('vendor_id', sa.UUID(), nullable=True),
        sa.Column('credit_limit_minor_units', sa.Integer(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['operator_id'], ['operators.id']),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('operator_id', name='uq_party_role_operator'),
        sa.UniqueConstraint('client_id', name='uq_party_role_client'),
        sa.UniqueConstraint('vendor_id', name='uq_party_role_vendor'),
    )
    op.create_index(op.f('ix_party_roles_party_id'), 'party_roles', ['party_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_party_roles_party_id'), table_name='party_roles')
    op.drop_table('party_roles')
    op.drop_table('parties')
    bind = op.get_bind()
    sa.Enum(name='party_role_type').drop(bind, checkfirst=True)
