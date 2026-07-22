from pydantic import BaseModel, ConfigDict, Field


class PersonBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = ""
    department: str = ""
    passport_number: str | None = None
    phone: str | None = None
    email: str | None = None
    # "inside" = works in the office, "outside" = outside-office worker
    location: str = "inside"
    is_active: bool = True


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = None
    department: str | None = None
    passport_number: str | None = None
    phone: str | None = None
    email: str | None = None
    location: str | None = None
    is_active: bool | None = None


class PersonOut(PersonBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class PersonSummary(BaseModel):
    """Person row enriched with expense totals for aggregation views."""

    id: int
    name: str
    role: str
    department: str
    total_amount: float
    total_vat: float
    grand_total: float
    expense_count: int
