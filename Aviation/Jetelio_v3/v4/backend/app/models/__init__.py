"""Import every model module so app.database.Base.metadata is complete for
Alembic autogenerate and for create_all in tests.
"""

from app.models.aircraft import Aircraft, AircraftPerformance  # noqa: F401
from app.models.aircraft_document import AircraftDocument  # noqa: F401
from app.models.airport import Airport  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.client import Client  # noqa: F401
from app.models.country import Country  # noqa: F401
from app.models.country_requirements import CountryRequirement  # noqa: F401
from app.models.document import Credential, Document, DocumentTypeTemplate  # noqa: F401
from app.models.geometry import CountryGeometry, FirBoundary  # noqa: F401
from app.models.messaging import MessageTemplate  # noqa: F401
from app.models.nav_fee_provider import NavFeeProvider  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.operator import Operator  # noqa: F401
from app.models.party import Party, PartyRole  # noqa: F401
from app.models.permit_fee_provider import PermitFeeProvider  # noqa: F401
from app.models.person import Person  # noqa: F401
from app.models.route_cache import RouteCache  # noqa: F401
from app.models.service_catalogue import ServiceCatalogueEntry  # noqa: F401
from app.models.service_delivery import ConfirmationRoutingConfig, ServiceDeliveryConfig, VendorContact  # noqa: F401
from app.models.service_message import ServiceMessage  # noqa: F401
from app.models.settings import Setting  # noqa: F401
from app.models.trip import Trip, TripLeg  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.vendor import Vendor, VendorCoverageAirport, VendorCoverageCountry  # noqa: F401
from app.models.visa import VisaMatrixCell, VisaRule  # noqa: F401

__all__ = [
    "Aircraft",
    "AircraftDocument",
    "AircraftPerformance",
    "Airport",
    "AuditLog",
    "Client",
    "ConfirmationRoutingConfig",
    "Country",
    "CountryRequirement",
    "CountryGeometry",
    "Credential",
    "Document",
    "DocumentTypeTemplate",
    "FirBoundary",
    "MessageTemplate",
    "Notification",
    "Operator",
    "Party",
    "PartyRole",
    "PermitFeeProvider",
    "Person",
    "RouteCache",
    "ServiceCatalogueEntry",
    "ServiceDeliveryConfig",
    "ServiceMessage",
    "Setting",
    "Trip",
    "TripLeg",
    "User",
    "Vendor",
    "VendorContact",
    "VendorCoverageAirport",
    "VendorCoverageCountry",
    "VisaMatrixCell",
    "VisaRule",
]
