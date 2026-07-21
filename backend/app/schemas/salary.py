from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class SalaryBase(BaseModel):
    person_id: int
    role: str = ""
    passport_number: str = Field(min_length=1, max_length=64)
    pay_type: str = "salary"
    amount: float = Field(gt=0)
    pay_date: date
    note: str | None = None


class SalaryCreate(SalaryBase):
    pass


class SalaryUpdate(BaseModel):
    person_id: int | None = None
    role: str | None = None
    passport_number: str | None = Field(default=None, min_length=1, max_length=64)
    pay_type: str | None = None
    amount: float | None = Field(default=None, gt=0)
    pay_date: date | None = None
    note: str | None = None


class SalaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    person_id: int
    person_name: str | None = None
    role: str
    passport_number: str
    pay_type: str
    amount: float
    pay_date: date
    month: int
    year: int
    note: str | None
