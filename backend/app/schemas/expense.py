from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ExpenseBase(BaseModel):
    person_id: int
    category: str = Field(min_length=1, max_length=80)
    reason: str = ""
    barcode: str | None = None
    amount: float = Field(gt=0)
    vat_applied: bool = False
    expense_date: date


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    person_id: int | None = None
    category: str | None = Field(default=None, min_length=1, max_length=80)
    reason: str | None = None
    barcode: str | None = None
    amount: float | None = Field(default=None, gt=0)
    vat_applied: bool | None = None
    expense_date: date | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    person_id: int
    person_name: str | None = None
    category: str
    reason: str
    barcode: str | None
    amount: float
    vat_applied: bool
    vat_amount: float
    total: float
    expense_date: date
    month: int
    year: int


class CategorySummary(BaseModel):
    category: str
    total_amount: float
    total_vat: float
    grand_total: float
    expense_count: int
