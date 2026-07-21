from pydantic import BaseModel

from app.schemas.expense import CategorySummary
from app.schemas.person import PersonSummary


class DashboardStats(BaseModel):
    total_expenses: float
    total_vat: float
    grand_total: float
    total_salaries: float
    expense_count: int
    salary_count: int
    person_count: int
    top_persons: list[PersonSummary]
    top_categories: list[CategorySummary]


class MonthlyPoint(BaseModel):
    year: int
    month: int
    label: str
    expenses: float
    vat: float
    salaries: float
