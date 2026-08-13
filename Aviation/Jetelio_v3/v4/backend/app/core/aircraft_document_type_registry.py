"""The canonical list of aircraft document types (task #118) — mirrors
app.core.document_template_registry's shape exactly (a plain dataclass
list, seeded idempotently at startup, admin-editable via CRUD after that).

Derived from a real 69-file reference document set for aircraft N80TE
(organized by the source filenames' own AC/INS/LTR/PERMIT prefixes — AC:
aircraft/operational certificates & authorizations, INS: country-specific
insurance, LTR: letters/authorizations, PERMIT: standing blanket permits/
clearances). The six REGISTRATION/COFA/INSURANCE/AIRWORTHINESS/
NOISE_CERTIFICATE/OTHER codes are the pre-existing AircraftDocumentType
enum values, kept byte-for-byte identical here (not renamed to the AC_/
INS_ prefix convention) so no existing AircraftDocument row or
app.domain.document_requirements._KEYWORD_TO_TYPE mapping breaks when the
column converts from a fixed Postgres enum to this FK-validated string.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AircraftDocumentTypeSeed:
    code: str
    label: str
    category: str  # AC | INS | LTR | PERMIT — see AircraftDocumentCategory
    sort_order: int


AIRCRAFT_DOCUMENT_TYPES: list[AircraftDocumentTypeSeed] = [
    AircraftDocumentTypeSeed(code="REGISTRATION", label="Registration Certificate", category="AC", sort_order=0),
    AircraftDocumentTypeSeed(code="COFA", label="Certificate of Airworthiness (COFA)", category="AC", sort_order=10),
    AircraftDocumentTypeSeed(code="INSURANCE", label="Civil Aircraft Certificate of Insurance", category="INS", sort_order=20),
    AircraftDocumentTypeSeed(code="AIRWORTHINESS", label="Airworthiness Certificate", category="AC", sort_order=30),
    AircraftDocumentTypeSeed(code="NOISE_CERTIFICATE", label="Noise Certificate", category="AC", sort_order=40),
    AircraftDocumentTypeSeed(code="OTHER", label="Other", category="AC", sort_order=50),
    AircraftDocumentTypeSeed(code="AC_AIR_CARRIER_CERTIFICATE", label="Air Carrier Certificate", category="AC", sort_order=60),
    AircraftDocumentTypeSeed(code="AC_AIRCRAFT_AUTHORIZATION", label="Aircraft Authorization", category="AC", sort_order=70),
    AircraftDocumentTypeSeed(code="AC_AIRCRAFT_MAINTENANCE_CAMP_AUTHORIZATION", label="Aircraft Maintenance Camp Authorization", category="AC", sort_order=80),
    AircraftDocumentTypeSeed(code="AC_AIRCRAFT_WEIGHING", label="Aircraft Weighing", category="AC", sort_order=90),
    AircraftDocumentTypeSeed(code="AC_AREAS_OF_EN_ROUTE_OPERATION", label="Areas Of En Route Operation", category="AC", sort_order=100),
    AircraftDocumentTypeSeed(code="AC_AUTH_AREAS_OF_EN_ROUTE_OPS", label="Auth Areas Of En Route Ops", category="AC", sort_order=110),
    AircraftDocumentTypeSeed(code="AC_CANADIAN_FOREIGN_AIR_OPERATOR_CERTIFICATE", label="Canadian Foreign Air Operator Certificate", category="AC", sort_order=120),
    AircraftDocumentTypeSeed(code="AC_CERTIFICATION_STATEMENT_AOC", label="Certification Statement AOC", category="AC", sort_order=130),
    AircraftDocumentTypeSeed(code="AC_CLASS_I_NAV_USING_AREA_OR_LRN_SYSTEMS", label="Class I Nav Using Area Or LRN Systems", category="AC", sort_order=140),
    AircraftDocumentTypeSeed(code="AC_CLIENT_PROFILE", label="Client Profile", category="AC", sort_order=150),
    AircraftDocumentTypeSeed(code="AC_DATA_LINK_COMMUNICATIONS", label="Data Link Communications", category="AC", sort_order=160),
    AircraftDocumentTypeSeed(code="AC_DEFINITIONS_AND_ABBREVIATIONS", label="Definitions And Abbreviations", category="AC", sort_order=170),
    AircraftDocumentTypeSeed(code="AC_DIAGRAM", label="Diagram", category="AC", sort_order=180),
    AircraftDocumentTypeSeed(code="AC_ENHANCED_FLIGHT_VISION_SYSTEM_EFVS_OPERATIONS", label="Enhanced Flight Vision System EFVS Operations", category="AC", sort_order=190),
    AircraftDocumentTypeSeed(code="AC_EXEMPTIONS_AND_DEVIATIONS", label="Exemptions And Deviations", category="AC", sort_order=200),
    AircraftDocumentTypeSeed(code="AC_EXTENDED_OVERWATER_OPERATIONS_USING_A_SINGLE_LONGRANGE_COMMUNICATION_SYSTEM", label="Extended Overwater Operations Using A Single Longrange Communication System", category="AC", sort_order=210),
    AircraftDocumentTypeSeed(code="AC_IFR_CLASS_1_PRNAV_BRNAV", label="IFR Class 1 PRNAV BRNAV", category="AC", sort_order=220),
    AircraftDocumentTypeSeed(code="AC_IFR_RNAV_1_DEPARTURE_PROCEDURES", label="IFR RNAV 1 Departure Procedures", category="AC", sort_order=230),
    AircraftDocumentTypeSeed(code="AC_ISSUANCE_AND_APPLICABILITY", label="Issuance And Applicability", category="AC", sort_order=240),
    AircraftDocumentTypeSeed(code="AC_LAYOUT_OF_PASSENGER_ACCOMMODATIONS", label="Layout Of Passenger Accommodations", category="AC", sort_order=250),
    AircraftDocumentTypeSeed(code="AC_MAINT_TIME_LIMITS", label="Maint Time Limits", category="AC", sort_order=260),
    AircraftDocumentTypeSeed(code="AC_MANAGEMENT_PERSONNEL", label="Management Personnel", category="AC", sort_order=270),
    AircraftDocumentTypeSeed(code="AC_MINIMUM_EQUIPMENT_LIST_AUTH", label="Minimum Equipment List Auth", category="AC", sort_order=280),
    AircraftDocumentTypeSeed(code="AC_OCEANIC_AND_REMOTE_CONTINENTAL_NAVIGATION_MLRNS", label="Oceanic And Remote Continental Navigation MLRNS", category="AC", sort_order=290),
    AircraftDocumentTypeSeed(code="AC_OPS_IN_NATMNPS_AIRSPACE", label="Ops In NATMNPS Airspace", category="AC", sort_order=300),
    AircraftDocumentTypeSeed(code="AC_OPS_IN_RVSM_AIRSPACE", label="Ops In RVSM Airspace", category="AC", sort_order=310),
    AircraftDocumentTypeSeed(code="AC_OTHER_DESIGNATED_PERSONS", label="Other Designated Persons", category="AC", sort_order=320),
    AircraftDocumentTypeSeed(code="AC_PRECISION_APPROACH_AND_LANDING_MIN", label="Precision Approach And Landing Min", category="AC", sort_order=330),
    AircraftDocumentTypeSeed(code="AC_RADIO_STATION_AUTHORIZATION_CERTIFICATE", label="Radio Station Authorization Certificate", category="AC", sort_order=340),
    AircraftDocumentTypeSeed(code="AC_SENSITIVE_INTERNATIONAL_AREAS", label="Sensitive International Areas", category="AC", sort_order=350),
    AircraftDocumentTypeSeed(code="AC_SPECIAL_LIMIATIONS_AND_PROVISIONS_FOR_INSTRUMENT_APPROACH", label="Special Limiations And Provisions For Instrument Approach", category="AC", sort_order=360),
    AircraftDocumentTypeSeed(code="AC_SPECIFICATION_FORM", label="Specification Form", category="AC", sort_order=370),
    AircraftDocumentTypeSeed(code="AC_SUMMARY_OF_SPECIAL_AUTHORIZATIONS_AND_LIMITATIONS", label="Summary Of Special Authorizations And Limitations", category="AC", sort_order=380),
    AircraftDocumentTypeSeed(code="AC_SUPPLEMENTAL_FLIGHT_MANUAL_CERTIFICATE", label="Supplemental Flight Manual Certificate", category="AC", sort_order=390),
    AircraftDocumentTypeSeed(code="AC_TERMINAL_VISUAL_FLIGHT_RULES", label="Terminal Visual Flight Rules", category="AC", sort_order=400),
    AircraftDocumentTypeSeed(code="AC_THIRD_COUNTRY_OPERATOR_EASA", label="Third Country Operator EASA", category="AC", sort_order=410),
    AircraftDocumentTypeSeed(code="AC_THIRD_COUNTRY_OPERATOR_UK", label="Third Country Operator UK", category="AC", sort_order=420),
    AircraftDocumentTypeSeed(code="AC_VERTICAL_NAVIGATION_VNAV", label="Vertical Navigation VNAV", category="AC", sort_order=430),
    AircraftDocumentTypeSeed(code="INS_AUSTRALIA", label="Australia", category="INS", sort_order=440),
    AircraftDocumentTypeSeed(code="INS_CANADA", label="Canada", category="INS", sort_order=450),
    AircraftDocumentTypeSeed(code="INS_CIVIL_USE_OF_UK_MINISTRY_OF_DEFENCE_AIRFIELDS", label="Civil Use Of UK Ministry Of Defence Airfields", category="INS", sort_order=460),
    AircraftDocumentTypeSeed(code="INS_EUROPE", label="Europe", category="INS", sort_order=470),
    AircraftDocumentTypeSeed(code="INS_GERMANY", label="Germany", category="INS", sort_order=480),
    AircraftDocumentTypeSeed(code="INS_GUAM", label="Guam", category="INS", sort_order=490),
    AircraftDocumentTypeSeed(code="INS_HONG_KONG", label="Hong Kong", category="INS", sort_order=500),
    AircraftDocumentTypeSeed(code="INS_ITALY", label="Italy", category="INS", sort_order=510),
    AircraftDocumentTypeSeed(code="INS_MEXICO_PART_91", label="Mexico Part 91", category="INS", sort_order=520),
    AircraftDocumentTypeSeed(code="INS_TURKEY", label="Turkey", category="INS", sort_order=530),
    AircraftDocumentTypeSeed(code="INS_UNITED_ARAB_EMIRATES", label="United Arab Emirates", category="INS", sort_order=540),
    AircraftDocumentTypeSeed(code="INS_UNITED_KINGDOM", label="United Kingdom", category="INS", sort_order=550),
    AircraftDocumentTypeSeed(code="INS_WORLD_WIDE", label="World Wide", category="INS", sort_order=560),
    AircraftDocumentTypeSeed(code="LTR_3LETTER_CORPORATE_IDENTIFIER", label="3-Letter Corporate Identifier", category="LTR", sort_order=570),
    AircraftDocumentTypeSeed(code="LTR_FOREIGN_AIR_CARRIER_SECURITY_PROGRAM", label="Foreign Air Carrier Security Program", category="LTR", sort_order=580),
    AircraftDocumentTypeSeed(code="LTR_FOREIGN_AUTHORIZATION_LETTER", label="Foreign Authorization Letter", category="LTR", sort_order=590),
    AircraftDocumentTypeSeed(code="LTR_LETTER_OF_ATTORNEY", label="Letter Of Attorney", category="LTR", sort_order=600),
    AircraftDocumentTypeSeed(code="LTR_MEXICO_AUTHORIZATION_LETTER", label="Mexico Authorization Letter", category="LTR", sort_order=610),
    AircraftDocumentTypeSeed(code="LTR_POWER_OF_ATTORNEY", label="Power Of Attorney", category="LTR", sort_order=620),
    AircraftDocumentTypeSeed(code="LTR_TRANSPORT_SECURITY_PROGRAM", label="Transport Security Program", category="LTR", sort_order=630),
    AircraftDocumentTypeSeed(code="LTR_TURKEY_AUTHORIZATION_LETTER", label="Turkey Authorization Letter", category="LTR", sort_order=640),
    AircraftDocumentTypeSeed(code="LTR_TWELVEFIVE_STANDARD_SECURITY", label="Twelve-Five Standard Security", category="LTR", sort_order=650),
    AircraftDocumentTypeSeed(code="LTR_VISA_WAIVER_PROGRAM_AGREEMENT", label="Visa Waiver Program Agreement", category="LTR", sort_order=660),
    AircraftDocumentTypeSeed(code="PERMIT_BAHAMAS_BLANKET", label="Bahamas Blanket", category="PERMIT", sort_order=670),
    AircraftDocumentTypeSeed(code="PERMIT_BORDER_OVERFLIGHT_EXEMPTION", label="Border Overflight Exemption", category="PERMIT", sort_order=680),
    AircraftDocumentTypeSeed(code="PERMIT_GREECE_ANNUAL_CLEARANCE", label="Greece Annual Clearance", category="PERMIT", sort_order=690),
    AircraftDocumentTypeSeed(code="PERMIT_ITALY_ANNUAL_CLEARANCE", label="Italy Annual Clearance", category="PERMIT", sort_order=700),
    AircraftDocumentTypeSeed(code="PERMIT_US_CUSTOMS_BOND", label="US Customs Bond", category="PERMIT", sort_order=710),
]

AIRCRAFT_DOCUMENT_TYPES_BY_CODE: dict[str, AircraftDocumentTypeSeed] = {t.code: t for t in AIRCRAFT_DOCUMENT_TYPES}
