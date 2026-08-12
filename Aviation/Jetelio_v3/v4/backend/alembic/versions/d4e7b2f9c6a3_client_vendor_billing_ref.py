"""clients.billing_ref + vendors.billing_ref (sequence-backed CLI-000123/
VEN-000123, backfilled for existing rows)

Revision ID: d4e7b2f9c6a3
Revises: c3f8a1e5b9d2
Create Date: 2026-08-12 00:00:06.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e7b2f9c6a3'
down_revision: Union[str, None] = 'c3f8a1e5b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE clients_billing_ref_seq")
    op.execute("CREATE SEQUENCE vendors_billing_ref_seq")

    op.add_column('clients', sa.Column('billing_ref', sa.String(length=20), nullable=True))
    op.add_column('vendors', sa.Column('billing_ref', sa.String(length=20), nullable=True))

    # Backfill existing rows in creation order, then advance each sequence
    # past the highest number just assigned so the next real nextval() call
    # doesn't collide with a backfilled value.
    op.execute(
        """
        UPDATE clients SET billing_ref = 'CLI-' || LPAD(sub.rn::text, 6, '0')
        FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM clients) sub
        WHERE clients.id = sub.id
        """
    )
    op.execute("SELECT setval('clients_billing_ref_seq', GREATEST((SELECT count(*) FROM clients), 1), (SELECT count(*) FROM clients) > 0)")

    op.execute(
        """
        UPDATE vendors SET billing_ref = 'VEN-' || LPAD(sub.rn::text, 6, '0')
        FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM vendors) sub
        WHERE vendors.id = sub.id
        """
    )
    op.execute("SELECT setval('vendors_billing_ref_seq', GREATEST((SELECT count(*) FROM vendors), 1), (SELECT count(*) FROM vendors) > 0)")

    op.alter_column('clients', 'billing_ref', nullable=False)
    op.alter_column('vendors', 'billing_ref', nullable=False)
    op.create_unique_constraint('uq_clients_billing_ref', 'clients', ['billing_ref'])
    op.create_unique_constraint('uq_vendors_billing_ref', 'vendors', ['billing_ref'])


def downgrade() -> None:
    op.drop_constraint('uq_vendors_billing_ref', 'vendors', type_='unique')
    op.drop_constraint('uq_clients_billing_ref', 'clients', type_='unique')
    op.drop_column('vendors', 'billing_ref')
    op.drop_column('clients', 'billing_ref')
    op.execute("DROP SEQUENCE vendors_billing_ref_seq")
    op.execute("DROP SEQUENCE clients_billing_ref_seq")
