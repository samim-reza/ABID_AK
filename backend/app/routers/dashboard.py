from calendar import month_abbr

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Expense, Person, WorkerSalary
from app.schemas.dashboard import DashboardStats, MonthlyPoint
from app.schemas.expense import CategorySummary
from app.schemas.person import PersonSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/stats", response_model=DashboardStats)
def stats(
    db: Session = Depends(get_db),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
) -> DashboardStats:
    net = WorkerSalary.basic_amount + WorkerSalary.overtime_amount - WorkerSalary.advance_amount
    exp = select(Expense)
    sal = select(net.label("amount"))
    if month:
        exp = exp.where(Expense.month == month)
        sal = sal.where(WorkerSalary.month == month)
    if year:
        exp = exp.where(Expense.year == year)
        sal = sal.where(WorkerSalary.year == year)
    exp_sub, sal_sub = exp.subquery(), sal.subquery()

    total_amount = db.scalar(select(func.coalesce(func.sum(exp_sub.c.amount), 0))) or 0
    total_vat = db.scalar(select(func.coalesce(func.sum(exp_sub.c.vat_amount), 0))) or 0
    grand_total = db.scalar(select(func.coalesce(func.sum(exp_sub.c.total), 0))) or 0
    exp_count = db.scalar(select(func.count()).select_from(exp_sub)) or 0
    total_salaries = db.scalar(select(func.coalesce(func.sum(sal_sub.c.amount), 0))) or 0
    sal_count = db.scalar(select(func.count()).select_from(sal_sub)) or 0
    person_count = db.scalar(select(func.count()).select_from(Person)) or 0

    # top persons
    ps = (
        select(
            Person.id, Person.name, Person.role, Person.department,
            func.coalesce(func.sum(Expense.amount), 0),
            func.coalesce(func.sum(Expense.vat_amount), 0),
            func.coalesce(func.sum(Expense.total), 0),
            func.count(Expense.id),
        )
        .select_from(Person)
        .outerjoin(Expense, Expense.person_id == Person.id)
        .group_by(Person.id)
        .order_by(func.coalesce(func.sum(Expense.total), 0).desc())
        .limit(5)
    )
    if month:
        ps = ps.where(Expense.month == month)
    if year:
        ps = ps.where(Expense.year == year)
    top_persons = [
        PersonSummary(id=r[0], name=r[1], role=r[2], department=r[3], total_amount=float(r[4]),
                      total_vat=float(r[5]), grand_total=float(r[6]), expense_count=r[7])
        for r in db.execute(ps).all()
    ]

    cs = (
        select(func.min(Expense.category), func.sum(Expense.amount), func.sum(Expense.vat_amount),
               func.sum(Expense.total), func.count(Expense.id))
        .group_by(func.lower(Expense.category))
        .order_by(func.sum(Expense.total).desc())
        .limit(6)
    )
    if month:
        cs = cs.where(Expense.month == month)
    if year:
        cs = cs.where(Expense.year == year)
    top_categories = [
        CategorySummary(category=r[0], total_amount=float(r[1]), total_vat=float(r[2]),
                        grand_total=float(r[3]), expense_count=r[4])
        for r in db.execute(cs).all()
    ]

    return DashboardStats(
        total_expenses=float(total_amount), total_vat=float(total_vat),
        grand_total=float(grand_total), total_salaries=float(total_salaries),
        expense_count=exp_count, salary_count=sal_count, person_count=person_count,
        top_persons=top_persons, top_categories=top_categories,
    )


@router.get("/monthly", response_model=list[MonthlyPoint])
def monthly(db: Session = Depends(get_db), year: int | None = None) -> list[MonthlyPoint]:
    """Expense/VAT/salary totals per month for the trend chart."""
    net = WorkerSalary.basic_amount + WorkerSalary.overtime_amount - WorkerSalary.advance_amount
    exp = select(Expense.year, Expense.month, func.sum(Expense.total), func.sum(Expense.vat_amount)).group_by(Expense.year, Expense.month)
    sal = select(WorkerSalary.year, WorkerSalary.month, func.sum(net)).group_by(WorkerSalary.year, WorkerSalary.month)
    if year:
        exp = exp.where(Expense.year == year)
        sal = sal.where(WorkerSalary.year == year)

    buckets: dict[tuple[int, int], MonthlyPoint] = {}
    for y, m, tot, vat in db.execute(exp).all():
        buckets[(y, m)] = MonthlyPoint(year=y, month=m, label=f"{month_abbr[m]} {y}",
                                       expenses=float(tot), vat=float(vat), salaries=0.0)
    for y, m, amt in db.execute(sal).all():
        if (y, m) in buckets:
            buckets[(y, m)].salaries = float(amt)
        else:
            buckets[(y, m)] = MonthlyPoint(year=y, month=m, label=f"{month_abbr[m]} {y}",
                                           expenses=0.0, vat=0.0, salaries=float(amt))
    return [buckets[k] for k in sorted(buckets)]


@router.get("/periods", response_model=list[int])
def available_years(db: Session = Depends(get_db)) -> list[int]:
    years = {r[0] for r in db.execute(select(Expense.year).distinct()).all()}
    years |= {r[0] for r in db.execute(select(WorkerSalary.year).distinct()).all()}
    return sorted(years, reverse=True)
