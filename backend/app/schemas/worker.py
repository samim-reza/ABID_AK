from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# ---------- Company / Project ----------


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class CompanyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class ProjectCreate(BaseModel):
    company_id: int
    name: str = Field(min_length=1, max_length=160)


class ProjectUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    name: str
    worker_count: int = 0


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    projects: list[ProjectOut] = []
    worker_count: int = 0


# ---------- Worker ----------


class WorkerBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    nationality: str = ""
    passport_number: str | None = None
    iqama_number: str | None = None
    iqama_expiry: date | None = None
    phone: str | None = None
    company_id: int
    project_id: int
    pay_type: str = "monthly"
    base_rate: float = Field(default=0, ge=0)
    note: str | None = None


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    nationality: str | None = None
    passport_number: str | None = None
    iqama_number: str | None = None
    iqama_expiry: date | None = None
    phone: str | None = None
    company_id: int | None = None
    project_id: int | None = None
    pay_type: str | None = None
    base_rate: float | None = Field(default=None, ge=0)
    note: str | None = None


class WorkerOut(WorkerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_released: bool
    released_at: date | None
    company_name: str | None = None
    project_name: str | None = None


# ---------- Worker salary ----------


class WorkerSalaryUpsert(BaseModel):
    worker_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    basic_amount: float = Field(default=0, ge=0)
    overtime_hours: float | None = Field(default=None, ge=0)
    advance_amount: float = Field(default=0, ge=0)
    hours: float | None = Field(default=None, ge=0)
    paid: bool = False
    pay_date: date | None = None
    note: str | None = None


class WorkerSalaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    worker_id: int
    worker_name: str | None = None
    year: int
    month: int
    basic_amount: float
    overtime_hours: float | None
    overtime_amount: float
    advance_amount: float
    hours: float | None
    net_amount: float = 0
    paid: bool
    pay_date: date | None
    note: str | None


class PayrollRow(BaseModel):
    """A worker joined with their salary for a specific month (may be unpaid/empty)."""

    worker_id: int
    name: str
    nationality: str
    company_name: str | None
    project_name: str | None
    pay_type: str
    base_rate: float = 0
    is_released: bool
    salary_id: int | None = None
    suggested_basic: float = 0
    basic_amount: float = 0
    overtime_hours: float | None = None
    overtime_amount: float = 0
    advance_amount: float = 0
    net_amount: float = 0
    paid: bool = False
    has_record: bool = False
