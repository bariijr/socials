import enum

from sqlalchemy import ARRAY, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class DeliveryChannel(str, enum.Enum):
    """A superset of app.models.messaging.MessagingChannel (which stays
    untouched — it backs four existing, working Postgres enum types on
    Operator/Client/Vendor/MessageTemplate, and ALTERing those in place was
    judged riskier than a new, separate enum for the new tables here).
    Covers all nine channels from the task #86 spec: email/phone/fax/sms/
    whatsapp/web portal/SITA/ARINC/AFTN.
    """

    EMAIL = "EMAIL"
    PHONE = "PHONE"
    FAX = "FAX"
    SMS = "SMS"
    WHATSAPP = "WHATSAPP"
    PORTAL = "PORTAL"
    SITA = "SITA"
    ARINC = "ARINC"
    AFTN = "AFTN"


class ConfirmationTargetRole(str, enum.Enum):
    CREW = "CREW"
    DISPATCH = "DISPATCH"
    OTHER = "OTHER"


class VendorContact(Base, StandardMixin):
    """A vendor's contact details for one delivery channel — "contacts per
    delivery type per vendor" from the spec. A vendor can have several
    contacts on the same channel (e.g. two emails); `is_primary` picks the
    default when more than one exists for a channel.
    """

    __tablename__ = "vendor_contacts"

    vendor_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    channel: Mapped[DeliveryChannel] = mapped_column(Enum(DeliveryChannel, name="delivery_channel"), nullable=False)
    contact_value: Mapped[str] = mapped_column(String(300), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_primary: Mapped[bool] = mapped_column(nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class ServiceDeliveryConfig(Base, StandardMixin):
    """How a service request gets sent to a vendor — multiple simultaneous
    channels (delivery_channels is a set, not one value), scoped to
    exactly one of leg/trip/operator. Precedence when more than one
    candidate config matches is leg > trip > operator (see
    app.domain.service_delivery.resolve_service_delivery_config).
    `service_code=NULL` means "applies to every service" at that scope.
    """

    __tablename__ = "service_delivery_configs"

    leg_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trip_legs.id", ondelete="CASCADE"), nullable=True)
    trip_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=True)
    operator_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=True)

    service_code: Mapped[str | None] = mapped_column(String(20), ForeignKey("service_catalogue.code"), nullable=True)
    vendor_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    message_template_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("message_templates.id"), nullable=True)
    delivery_channels: Mapped[list[DeliveryChannel]] = mapped_column(ARRAY(Enum(DeliveryChannel, name="delivery_channel")), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class ConfirmationRoutingConfig(Base, StandardMixin):
    """Where a service confirmation gets routed once a vendor responds —
    deliberately a separate table from ServiceDeliveryConfig (the spec
    calls this out as "a separate confirmation message/delivery config"),
    same scope/precedence shape (leg > trip > operator).
    """

    __tablename__ = "confirmation_routing_configs"

    leg_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trip_legs.id", ondelete="CASCADE"), nullable=True)
    trip_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=True)
    operator_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=True)

    target_role: Mapped[ConfirmationTargetRole] = mapped_column(Enum(ConfirmationTargetRole, name="confirmation_target_role"), nullable=False)
    # Only meaningful for/optional on OTHER — CREW/DISPATCH are resolved
    # from the trip's own crew/operator contacts at send time, not stored
    # here.
    target_contact_override: Mapped[str | None] = mapped_column(String(300), nullable=True)
    confirmation_channels: Mapped[list[DeliveryChannel]] = mapped_column(ARRAY(Enum(DeliveryChannel, name="delivery_channel")), nullable=False)
    message_template_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("message_templates.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
