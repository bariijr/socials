"""operator address/fax/airline codes + aircraft classification (task #119)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-12 00:00:10.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('operators', sa.Column('address_line1', sa.String(length=300), nullable=True))
    op.add_column('operators', sa.Column('address_line2', sa.String(length=300), nullable=True))
    op.add_column('operators', sa.Column('city', sa.String(length=200), nullable=True))
    op.add_column('operators', sa.Column('state_province', sa.String(length=200), nullable=True))
    op.add_column('operators', sa.Column('postal_code', sa.String(length=50), nullable=True))
    op.add_column('operators', sa.Column('country_iso3', sa.String(length=3), nullable=True))
    op.add_column('operators', sa.Column('contact_fax', sa.String(length=50), nullable=True))
    op.add_column('operators', sa.Column('airline_code_aftn', sa.String(length=20), nullable=True))
    op.add_column('operators', sa.Column('airline_code_sita', sa.String(length=20), nullable=True))
    op.create_foreign_key('fk_operators_country_iso3_countries', 'operators', 'countries', ['country_iso3'], ['iso3'])

    op.add_column('aircraft', sa.Column('classification', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('aircraft', 'classification')

    op.drop_constraint('fk_operators_country_iso3_countries', 'operators', type_='foreignkey')
    op.drop_column('operators', 'airline_code_sita')
    op.drop_column('operators', 'airline_code_aftn')
    op.drop_column('operators', 'contact_fax')
    op.drop_column('operators', 'country_iso3')
    op.drop_column('operators', 'postal_code')
    op.drop_column('operators', 'state_province')
    op.drop_column('operators', 'city')
    op.drop_column('operators', 'address_line2')
    op.drop_column('operators', 'address_line1')
