"""persons (reusable crew/pax reference records)

Revision ID: e7a4d2f8b1c6
Revises: d1f6b3a9c7e2
Create Date: 2026-08-12 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7a4d2f8b1c6'
down_revision: Union[str, None] = 'd1f6b3a9c7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'persons',
        sa.Column('party_id', sa.UUID(), nullable=True),
        sa.Column('full_name', sa.String(length=300), nullable=False),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('nationality_iso3', sa.String(length=3), nullable=True),
        sa.Column('role_hint', sa.Enum('CREW', 'PAX', 'BOTH', name='person_role_hint'), nullable=False),
        sa.Column('email', sa.String(length=300), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('passport_number', sa.String(length=50), nullable=True),
        sa.Column('passport_expiry', sa.Date(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id']),
        sa.ForeignKeyConstraint(['nationality_iso3'], ['countries.iso3']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_persons_party_id'), 'persons', ['party_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_persons_party_id'), table_name='persons')
    op.drop_table('persons')
    bind = op.get_bind()
    sa.Enum(name='person_role_hint').drop(bind, checkfirst=True)
