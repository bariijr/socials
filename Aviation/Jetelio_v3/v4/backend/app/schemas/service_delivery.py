from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.service_delivery import ConfirmationTargetRole, DeliveryChannel
from app.schemas.common import ORMModel


class VendorContactBase(BaseModel):
    vendor_id: UUID
    channel: DeliveryChannel
    contact_value: str
    contact_name: str | None = None
    is_primary: bool = False
    notes: str | None = None


class VendorContactCreate(VendorContactBase):
    pass


class VendorContactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    contact_value: str | None = None
    contact_name: str | None = None
    is_primary: bool | None = None
    notes: str | None = None


class VendorContactOut(ORMModel, VendorContactBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime


def _validate_exactly_one_scope(leg_id, trip_id, operator_id) -> None:
    if sum(1 for v in (leg_id, trip_id, operator_id) if v is not None) != 1:
        raise ValueError("exactly one of leg_id/trip_id/operator_id must be set")


class ServiceDeliveryConfigBase(BaseModel):
    leg_id: UUID | None = None
    trip_id: UUID | None = None
    operator_id: UUID | None = None
    service_code: str | None = None
    vendor_id: UUID
    message_template_id: UUID | None = None
    delivery_channels: list[DeliveryChannel] = Field(min_length=1)
    notes: str | None = None

    @model_validator(mode="after")
    def _one_scope(self):
        _validate_exactly_one_scope(self.leg_id, self.trip_id, self.operator_id)
        return self


class ServiceDeliveryConfigCreate(ServiceDeliveryConfigBase):
    pass


class ServiceDeliveryConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    service_code: str | None = None
    vendor_id: UUID | None = None
    message_template_id: UUID | None = None
    delivery_channels: list[DeliveryChannel] | None = Field(default=None, min_length=1)
    notes: str | None = None


class ServiceDeliveryConfigOut(ORMModel, ServiceDeliveryConfigBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime


class ServiceDeliveryResolvedOut(BaseModel):
    """What `/service-delivery-configs/resolve` returns — the single
    winning config for a given leg/service, or null if nothing matches
    (never a guessed default)."""

    config: ServiceDeliveryConfigOut | None
    matched_scope: str | None  # "LEG" / "TRIP" / "OPERATOR" / None


class ConfirmationRoutingConfigBase(BaseModel):
    leg_id: UUID | None = None
    trip_id: UUID | None = None
    operator_id: UUID | None = None
    target_role: ConfirmationTargetRole
    target_contact_override: str | None = None
    confirmation_channels: list[DeliveryChannel] = Field(min_length=1)
    message_template_id: UUID | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _one_scope(self):
        _validate_exactly_one_scope(self.leg_id, self.trip_id, self.operator_id)
        return self


class ConfirmationRoutingConfigCreate(ConfirmationRoutingConfigBase):
    pass


class ConfirmationRoutingConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    target_contact_override: str | None = None
    confirmation_channels: list[DeliveryChannel] | None = Field(default=None, min_length=1)
    message_template_id: UUID | None = None
    notes: str | None = None


class ConfirmationRoutingConfigOut(ORMModel, ConfirmationRoutingConfigBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime


class ConfirmationRoutingResolvedOut(BaseModel):
    config: ConfirmationRoutingConfigOut | None
    matched_scope: str | None
