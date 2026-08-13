from uuid import UUID

from pydantic import BaseModel


class PersonRoleBase(BaseModel):
    code: str
    label: str
    is_crew: bool
    sort_order: int | None = None
    active: bool = True


class PersonRoleCreate(PersonRoleBase):
    pass


class PersonRoleUpdate(BaseModel):
    version: int
    label: str | None = None
    is_crew: bool | None = None
    sort_order: int | None = None
    active: bool | None = None


class PersonRoleOut(PersonRoleBase):
    id: UUID
    version: int
