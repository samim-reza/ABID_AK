from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class InvoiceUpdate(BaseModel):
    """Metadata-only edit — the stored PDF itself is never replaced."""

    company_id: int | None = None
    invoice_number: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=255)
    amount: float | None = Field(default=None, gt=0)
    invoice_date: date | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    company_name: str | None = None
    invoice_number: str | None
    description: str
    amount: float
    vat_rate: float
    vat_amount: float
    total: float
    invoice_date: date
    month: int
    year: int
    file_name: str
    file_size: int
    created_at: datetime


class InvoiceCompanySummary(BaseModel):
    company_id: int
    company_name: str
    invoice_count: int
    total_amount: float
    total_vat: float
    grand_total: float


class InvoiceTotals(BaseModel):
    invoice_count: int
    total_amount: float
    total_vat: float
    grand_total: float
