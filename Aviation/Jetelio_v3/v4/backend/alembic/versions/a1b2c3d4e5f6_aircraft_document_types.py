"""aircraft_document_types — replaces the fixed AircraftDocumentType enum
with an admin-editable reference table (task #118). Seeds the 6 legacy
codes (REGISTRATION/COFA/INSURANCE/AIRWORTHINESS/NOISE_CERTIFICATE/OTHER)
directly in this migration, not via app-startup ensure_seeded, because
existing aircraft_documents rows reference them and the new FK constraint
must be satisfiable the instant it's created — ensure_seeded only runs
after migrations finish, which would be too late. The other 66 codes
(from the real N80TE reference document set) are seeded the same way here
for consistency, though nothing existing depends on them yet.

Revision ID: a1b2c3d4e5f6
Revises: f9d2b4e7a1c6
Create Date: 2026-08-12 00:00:09.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f9d2b4e7a1c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_DOC_TYPE = sa.Enum(
    'REGISTRATION', 'COFA', 'INSURANCE', 'AIRWORTHINESS', 'NOISE_CERTIFICATE', 'OTHER',
    name='aircraft_document_type',
)

CATEGORY = sa.Enum('AC', 'INS', 'LTR', 'PERMIT', name='aircraft_document_category')

# (code, label, category, sort_order) — see app.core.aircraft_document_type_registry
# for the maintained-going-forward copy of this same list.
SEED_ROWS = [
    ("REGISTRATION", "Registration Certificate", "AC", 0),
    ("COFA", "Certificate of Airworthiness (COFA)", "AC", 10),
    ("INSURANCE", "Civil Aircraft Certificate of Insurance", "INS", 20),
    ("AIRWORTHINESS", "Airworthiness Certificate", "AC", 30),
    ("NOISE_CERTIFICATE", "Noise Certificate", "AC", 40),
    ("OTHER", "Other", "AC", 50),
    ("AC_AIR_CARRIER_CERTIFICATE", "Air Carrier Certificate", "AC", 60),
    ("AC_AIRCRAFT_AUTHORIZATION", "Aircraft Authorization", "AC", 70),
    ("AC_AIRCRAFT_MAINTENANCE_CAMP_AUTHORIZATION", "Aircraft Maintenance Camp Authorization", "AC", 80),
    ("AC_AIRCRAFT_WEIGHING", "Aircraft Weighing", "AC", 90),
    ("AC_AREAS_OF_EN_ROUTE_OPERATION", "Areas Of En Route Operation", "AC", 100),
    ("AC_AUTH_AREAS_OF_EN_ROUTE_OPS", "Auth Areas Of En Route Ops", "AC", 110),
    ("AC_CANADIAN_FOREIGN_AIR_OPERATOR_CERTIFICATE", "Canadian Foreign Air Operator Certificate", "AC", 120),
    ("AC_CERTIFICATION_STATEMENT_AOC", "Certification Statement AOC", "AC", 130),
    ("AC_CLASS_I_NAV_USING_AREA_OR_LRN_SYSTEMS", "Class I Nav Using Area Or LRN Systems", "AC", 140),
    ("AC_CLIENT_PROFILE", "Client Profile", "AC", 150),
    ("AC_DATA_LINK_COMMUNICATIONS", "Data Link Communications", "AC", 160),
    ("AC_DEFINITIONS_AND_ABBREVIATIONS", "Definitions And Abbreviations", "AC", 170),
    ("AC_DIAGRAM", "Diagram", "AC", 180),
    ("AC_ENHANCED_FLIGHT_VISION_SYSTEM_EFVS_OPERATIONS", "Enhanced Flight Vision System EFVS Operations", "AC", 190),
    ("AC_EXEMPTIONS_AND_DEVIATIONS", "Exemptions And Deviations", "AC", 200),
    ("AC_EXTENDED_OVERWATER_OPERATIONS_USING_A_SINGLE_LONGRANGE_COMMUNICATION_SYSTEM", "Extended Overwater Operations Using A Single Longrange Communication System", "AC", 210),
    ("AC_IFR_CLASS_1_PRNAV_BRNAV", "IFR Class 1 PRNAV BRNAV", "AC", 220),
    ("AC_IFR_RNAV_1_DEPARTURE_PROCEDURES", "IFR RNAV 1 Departure Procedures", "AC", 230),
    ("AC_ISSUANCE_AND_APPLICABILITY", "Issuance And Applicability", "AC", 240),
    ("AC_LAYOUT_OF_PASSENGER_ACCOMMODATIONS", "Layout Of Passenger Accommodations", "AC", 250),
    ("AC_MAINT_TIME_LIMITS", "Maint Time Limits", "AC", 260),
    ("AC_MANAGEMENT_PERSONNEL", "Management Personnel", "AC", 270),
    ("AC_MINIMUM_EQUIPMENT_LIST_AUTH", "Minimum Equipment List Auth", "AC", 280),
    ("AC_OCEANIC_AND_REMOTE_CONTINENTAL_NAVIGATION_MLRNS", "Oceanic And Remote Continental Navigation MLRNS", "AC", 290),
    ("AC_OPS_IN_NATMNPS_AIRSPACE", "Ops In NATMNPS Airspace", "AC", 300),
    ("AC_OPS_IN_RVSM_AIRSPACE", "Ops In RVSM Airspace", "AC", 310),
    ("AC_OTHER_DESIGNATED_PERSONS", "Other Designated Persons", "AC", 320),
    ("AC_PRECISION_APPROACH_AND_LANDING_MIN", "Precision Approach And Landing Min", "AC", 330),
    ("AC_RADIO_STATION_AUTHORIZATION_CERTIFICATE", "Radio Station Authorization Certificate", "AC", 340),
    ("AC_SENSITIVE_INTERNATIONAL_AREAS", "Sensitive International Areas", "AC", 350),
    ("AC_SPECIAL_LIMIATIONS_AND_PROVISIONS_FOR_INSTRUMENT_APPROACH", "Special Limiations And Provisions For Instrument Approach", "AC", 360),
    ("AC_SPECIFICATION_FORM", "Specification Form", "AC", 370),
    ("AC_SUMMARY_OF_SPECIAL_AUTHORIZATIONS_AND_LIMITATIONS", "Summary Of Special Authorizations And Limitations", "AC", 380),
    ("AC_SUPPLEMENTAL_FLIGHT_MANUAL_CERTIFICATE", "Supplemental Flight Manual Certificate", "AC", 390),
    ("AC_TERMINAL_VISUAL_FLIGHT_RULES", "Terminal Visual Flight Rules", "AC", 400),
    ("AC_THIRD_COUNTRY_OPERATOR_EASA", "Third Country Operator EASA", "AC", 410),
    ("AC_THIRD_COUNTRY_OPERATOR_UK", "Third Country Operator UK", "AC", 420),
    ("AC_VERTICAL_NAVIGATION_VNAV", "Vertical Navigation VNAV", "AC", 430),
    ("INS_AUSTRALIA", "Australia", "INS", 440),
    ("INS_CANADA", "Canada", "INS", 450),
    ("INS_CIVIL_USE_OF_UK_MINISTRY_OF_DEFENCE_AIRFIELDS", "Civil Use Of UK Ministry Of Defence Airfields", "INS", 460),
    ("INS_EUROPE", "Europe", "INS", 470),
    ("INS_GERMANY", "Germany", "INS", 480),
    ("INS_GUAM", "Guam", "INS", 490),
    ("INS_HONG_KONG", "Hong Kong", "INS", 500),
    ("INS_ITALY", "Italy", "INS", 510),
    ("INS_MEXICO_PART_91", "Mexico Part 91", "INS", 520),
    ("INS_TURKEY", "Turkey", "INS", 530),
    ("INS_UNITED_ARAB_EMIRATES", "United Arab Emirates", "INS", 540),
    ("INS_UNITED_KINGDOM", "United Kingdom", "INS", 550),
    ("INS_WORLD_WIDE", "World Wide", "INS", 560),
    ("LTR_3LETTER_CORPORATE_IDENTIFIER", "3-Letter Corporate Identifier", "LTR", 570),
    ("LTR_FOREIGN_AIR_CARRIER_SECURITY_PROGRAM", "Foreign Air Carrier Security Program", "LTR", 580),
    ("LTR_FOREIGN_AUTHORIZATION_LETTER", "Foreign Authorization Letter", "LTR", 590),
    ("LTR_LETTER_OF_ATTORNEY", "Letter Of Attorney", "LTR", 600),
    ("LTR_MEXICO_AUTHORIZATION_LETTER", "Mexico Authorization Letter", "LTR", 610),
    ("LTR_POWER_OF_ATTORNEY", "Power Of Attorney", "LTR", 620),
    ("LTR_TRANSPORT_SECURITY_PROGRAM", "Transport Security Program", "LTR", 630),
    ("LTR_TURKEY_AUTHORIZATION_LETTER", "Turkey Authorization Letter", "LTR", 640),
    ("LTR_TWELVEFIVE_STANDARD_SECURITY", "Twelve-Five Standard Security", "LTR", 650),
    ("LTR_VISA_WAIVER_PROGRAM_AGREEMENT", "Visa Waiver Program Agreement", "LTR", 660),
    ("PERMIT_BAHAMAS_BLANKET", "Bahamas Blanket", "PERMIT", 670),
    ("PERMIT_BORDER_OVERFLIGHT_EXEMPTION", "Border Overflight Exemption", "PERMIT", 680),
    ("PERMIT_GREECE_ANNUAL_CLEARANCE", "Greece Annual Clearance", "PERMIT", 690),
    ("PERMIT_ITALY_ANNUAL_CLEARANCE", "Italy Annual Clearance", "PERMIT", 700),
    ("PERMIT_US_CUSTOMS_BOND", "US Customs Bond", "PERMIT", 710),
]


def upgrade() -> None:
    # CATEGORY is NOT created explicitly here — create_table emits CREATE
    # TYPE for it automatically (see a3d7e2f9b6c1's own note on this exact
    # gotcha — calling .create() first and referencing it in create_table
    # double-creates it).
    op.create_table(
        'aircraft_document_types',
        sa.Column('code', sa.String(length=80), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('category', CATEGORY, nullable=False),
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
    op.create_index(op.f('ix_aircraft_document_types_code'), 'aircraft_document_types', ['code'], unique=True)

    table = sa.table(
        'aircraft_document_types',
        sa.column('code', sa.String), sa.column('label', sa.String), sa.column('category', CATEGORY),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(table, [{"code": c, "label": l, "category": cat, "sort_order": s} for c, l, cat, s in SEED_ROWS])

    # Existing enum values carry over unchanged via the ::text cast — every
    # current aircraft_documents.doc_type value is one of the 6 legacy
    # codes just seeded above, so the new FK is satisfiable immediately.
    op.alter_column(
        'aircraft_documents', 'doc_type',
        existing_type=OLD_DOC_TYPE, type_=sa.String(length=80),
        postgresql_using='doc_type::text', nullable=False,
    )
    op.create_foreign_key(
        'fk_aircraft_documents_doc_type', 'aircraft_documents', 'aircraft_document_types', ['doc_type'], ['code'],
    )
    bind = op.get_bind()
    OLD_DOC_TYPE.drop(bind, checkfirst=True)


def downgrade() -> None:
    op.drop_constraint('fk_aircraft_documents_doc_type', 'aircraft_documents', type_='foreignkey')
    bind = op.get_bind()
    OLD_DOC_TYPE.create(bind, checkfirst=True)
    op.alter_column(
        'aircraft_documents', 'doc_type',
        existing_type=sa.String(length=80), type_=OLD_DOC_TYPE,
        postgresql_using='doc_type::aircraft_document_type', nullable=False,
    )
    op.drop_index(op.f('ix_aircraft_document_types_code'), table_name='aircraft_document_types')
    op.drop_table('aircraft_document_types')
    CATEGORY.drop(bind, checkfirst=True)
