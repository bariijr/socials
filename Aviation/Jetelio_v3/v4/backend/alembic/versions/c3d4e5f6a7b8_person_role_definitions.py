"""person_role_definitions — replaces the fixed PersonPublicIn.role regex
and the fixed CREW_ROLES/PAX_ROLES frozensets with an admin-editable
reference table (task #120). Seeded directly in this migration (not via
app-startup ensure_seeded) for the same reason as aircraft_document_types
(a1b2c3d4e5f6): existing TripLeg.persons JSONB rows already contain role
strings that any future validation pass should recognize immediately.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-12 00:00:11.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (code, label, is_crew, sort_order) — see app.core.person_role_registry
# for the maintained-going-forward copy of this same list.
SEED_ROWS = [
    ("PIC", "Pilot in Command", True, 0),
    ("SIC", "Second in Command", True, 10),
    ("FO", "First Officer", True, 20),
    ("FA", "Flight Attendant", True, 30),
    ("MECHANIC", "Mechanic", True, 40),
    ("ENGINEER", "Engineer", True, 50),
    ("MEDICAL_STAFF", "Medical Staff", True, 60),
    ("CREW", "Crew (other)", True, 70),
    ("PAX", "Pax", False, 80),
    ("VIP", "VIP", False, 90),
    ("PRINCIPAL", "Principal", False, 100),
    ("OTHER", "Other", False, 110),
]


def upgrade() -> None:
    op.create_table(
        'person_role_definitions',
        sa.Column('code', sa.String(length=30), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('is_crew', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index(op.f('ix_person_role_definitions_code'), 'person_role_definitions', ['code'], unique=True)

    table = sa.table(
        'person_role_definitions',
        sa.column('code', sa.String), sa.column('label', sa.String), sa.column('is_crew', sa.Boolean),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(table, [{"code": c, "label": l, "is_crew": crew, "sort_order": s} for c, l, crew, s in SEED_ROWS])


def downgrade() -> None:
    op.drop_index(op.f('ix_person_role_definitions_code'), table_name='person_role_definitions')
    op.drop_table('person_role_definitions')
