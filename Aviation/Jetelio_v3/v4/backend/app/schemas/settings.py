from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class SettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    value: str


class SettingOut(ORMModel):
    key: str
    value: str
    value_type: str
    description: str
    version: int
    created_at: datetime
    updated_at: datetime
