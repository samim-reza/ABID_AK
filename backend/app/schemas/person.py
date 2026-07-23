from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class PersonBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = ""
    department: str = ""
    passport_number: str | None = None
    iqama_number: str | None = None
    iqama_expiry: date | None = None
    phone: str | None = None
    email: str | None = None
    # "inside" = works in the office, "outside" = outside-office worker
    location: str = "inside"
    monthly_salary: float = Field(default=0, ge=0)
    is_active: bool = True


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = None
    department: str | None = None
    passport_number: str | None = None
    iqama_number: str | None = None
    iqama_expiry: date | None = None
    phone: str | None = None
    email: str | None = None
    location: str | None = None
    monthly_salary: float | None = Field(default=None, ge=0)
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


class PersonSalaryUpsert(BaseModel):
    person_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    salary_amount: float = Field(default=0, ge=0)
    advance_amount: float = Field(default=0, ge=0)
    paid: bool = False
    pay_date: date | None = None
    note: str | None = None


class PersonSalaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    person_id: int
    person_name: str | None = None
    year: int
    month: int
    salary_amount: float
    advance_amount: float
    net_amount: float = 0
    paid: bool
    pay_date: date | None
    note: str | None


class PersonPayrollRow(BaseModel):
    person_id: int
    name: str
    role: str
    department: str
    location: str
    monthly_salary: float = 0
    is_active: bool
    salary_id: int | None = None
    suggested_salary: float = 0
    salary_amount: float = 0
    advance_amount: float = 0
    net_amount: float = 0
    paid: bool = False
    has_record: bool = False
