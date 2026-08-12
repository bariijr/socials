"""notifications — lightweight admin-panel notification (task #106)

Revision ID: f9d2b4e7a1c6
Revises: e6f3c9a2d5b7
Create Date: 2026-08-12 00:00:08.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f9d2b4e7a1c6'
down_revision: Union[str, None] = 'e6f3c9a2d5b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', sa.String(length=100), nullable=False),
        sa.Column('kind', sa.String(length=100), nullable=False),
        sa.Column('message', sa.String(length=1000), nullable=False),
        sa.Column('seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_seen_at', 'notifications', ['seen_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_notifications_seen_at', table_name='notifications')
    op.drop_table('notifications')
