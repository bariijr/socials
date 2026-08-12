"""document_type_templates + documents + credentials

Revision ID: f4c8e1a6d3b9
Revises: e7a4d2f8b1c6
Create Date: 2026-08-12 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f4c8e1a6d3b9'
down_revision: Union[str, None] = 'e7a4d2f8b1c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'document_type_templates',
        sa.Column('doc_type', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('applies_to_entity_type', sa.Enum('PERSON', 'PARTY', name='doc_template_entity_type'), nullable=False),
        sa.Column('expected_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('doc_type'),
    )
    op.create_index(op.f('ix_document_type_templates_doc_type'), 'document_type_templates', ['doc_type'], unique=True)

    op.create_table(
        'documents',
        sa.Column('entity_type', sa.Enum('PERSON', 'PARTY', name='document_entity_type'), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('doc_type', sa.String(length=50), nullable=False),
        sa.Column('filename', sa.String(length=300), nullable=False),
        sa.Column('s3_key', sa.String(length=500), nullable=False),
        sa.Column('content_type', sa.String(length=150), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('ocr_raw_output', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('extracted_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.Enum('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUPERSEDED', name='document_status'), nullable=False),
        sa.Column('verified_by', sa.String(length=200), nullable=True),
        sa.Column('verified_on', sa.Date(), nullable=True),
        sa.Column('supersedes_document_id', sa.UUID(), nullable=True),
        sa.Column('uploaded_by', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['doc_type'], ['document_type_templates.doc_type']),
        sa.ForeignKeyConstraint(['supersedes_document_id'], ['documents.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('s3_key'),
    )
    op.create_index(op.f('ix_documents_entity_id'), 'documents', ['entity_id'], unique=False)

    op.create_table(
        'credentials',
        sa.Column('document_id', sa.UUID(), nullable=False),
        sa.Column('rating_code', sa.String(length=50), nullable=False),
        sa.Column('rating_name', sa.String(length=200), nullable=True),
        sa.Column('issued_on', sa.Date(), nullable=True),
        sa.Column('expires_on', sa.Date(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_credentials_document_id'), 'credentials', ['document_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_credentials_document_id'), table_name='credentials')
    op.drop_table('credentials')
    op.drop_index(op.f('ix_documents_entity_id'), table_name='documents')
    op.drop_table('documents')
    bind = op.get_bind()
    sa.Enum(name='document_status').drop(bind, checkfirst=True)
    op.drop_index(op.f('ix_document_type_templates_doc_type'), table_name='document_type_templates')
    op.drop_table('document_type_templates')
    sa.Enum(name='document_entity_type').drop(bind, checkfirst=True)
    sa.Enum(name='doc_template_entity_type').drop(bind, checkfirst=True)
