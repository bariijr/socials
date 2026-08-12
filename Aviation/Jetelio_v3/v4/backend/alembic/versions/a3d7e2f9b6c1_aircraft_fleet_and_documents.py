"""Aircraft fleet fields (colors/nationality/default_callsign) and
aircraft_documents table

Revision ID: a3d7e2f9b6c1
Revises: f7b3e9c2a5d8
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3d7e2f9b6c1'
down_revision: Union[str, None] = 'f7b3e9c2a5d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DOC_TYPE = sa.Enum(
    'REGISTRATION', 'COFA', 'INSURANCE', 'AIRWORTHINESS', 'NOISE_CERTIFICATE', 'OTHER',
    name='aircraft_document_type',
)


def upgrade() -> None:
    op.add_column('aircraft', sa.Column('colors', sa.String(length=200), nullable=True))
    op.add_column('aircraft', sa.Column('nationality_iso3', sa.String(length=3), nullable=True))
    op.add_column('aircraft', sa.Column('default_callsign', sa.String(length=20), nullable=True))
    op.create_foreign_key('fk_aircraft_nationality_iso3_countries', 'aircraft', 'countries', ['nationality_iso3'], ['iso3'])

    # DOC_TYPE is NOT created explicitly here — op.create_table below emits
    # CREATE TYPE for it automatically as part of the table DDL. Calling
    # DOC_TYPE.create() first and then also referencing it in create_table
    # double-creates it (a real error hit while testing this migration).
    op.create_table(
        'aircraft_documents',
        sa.Column('aircraft_id', sa.UUID(), nullable=False),
        sa.Column('doc_type', DOC_TYPE, nullable=False),
        sa.Column('filename', sa.String(length=300), nullable=False),
        sa.Column('s3_key', sa.String(length=500), nullable=False),
        sa.Column('content_type', sa.String(length=150), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('uploaded_by', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['aircraft_id'], ['aircraft.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('s3_key'),
    )
    op.create_index(op.f('ix_aircraft_documents_aircraft_id'), 'aircraft_documents', ['aircraft_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_aircraft_documents_aircraft_id'), table_name='aircraft_documents')
    op.drop_table('aircraft_documents')
    bind = op.get_bind()
    DOC_TYPE.drop(bind, checkfirst=True)

    op.drop_constraint('fk_aircraft_nationality_iso3_countries', 'aircraft', type_='foreignkey')
    op.drop_column('aircraft', 'default_callsign')
    op.drop_column('aircraft', 'nationality_iso3')
    op.drop_column('aircraft', 'colors')
