from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.activity_log import log_activity
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Expense, Person, User
from app.schemas.common import Page
from app.schemas.expense import (
    CategorySummary,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
)

router = APIRouter(prefix="/expenses", tags=["expenses"], dependencies=[Depends(get_current_user)])


def _money(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _compute_vat(amount: float, vat_applied: bool) -> tuple[float, float]:
    """Return (vat_amount, total) for a base amount."""
    vat = _money(amount * settings.vat_rate) if vat_applied else 0.0
    return vat, _money(amount + vat)


def _to_out(expense: Expense) -> ExpenseOut:
    out = ExpenseOut.model_validate(expense)
    out.person_name = expense.person.name if expense.person else None
    return out


def _canonical_category(db: Session, raw: str) -> str:
    """Normalise a category so casing variants ("car" / "Car") stay one group.

    Reuses the spelling of any existing category that matches case-insensitively;
    otherwise keeps the (stripped) text as typed.
    """
    value = raw.strip()
    existing = db.scalar(
        select(Expense.category).where(func.lower(Expense.category) == value.lower()).limit(1)
    )
    return existing or value


@router.get("", response_model=Page[ExpenseOut])
def list_expenses(
    db: Session = Depends(get_db),
    person_id: int | None = None,
    category: str | None = None,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ExpenseOut]:
    stmt = select(Expense)
    if person_id:
        stmt = stmt.where(Expense.person_id == person_id)
    if category:
        stmt = stmt.where(func.lower(Expense.category) == category.strip().lower())
    if month:
        stmt = stmt.where(Expense.month == month)
    if year:
        stmt = stmt.where(Expense.year == year)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Expense.expense_date.desc(), Expense.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([_to_out(r) for r in rows], total, page, page_size)


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)) -> list[str]:
    # collapse casing variants ("car" / "Car") to a single representative label
    stmt = (
        select(func.min(Expense.category))
        .group_by(func.lower(Expense.category))
        .order_by(func.min(Expense.category))
    )
    return [r[0] for r in db.execute(stmt).all()]


@router.get("/by-category", response_model=list[CategorySummary])
def by_category(
    db: Session = Depends(get_db),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
) -> list[CategorySummary]:
    stmt = (
        select(
            func.min(Expense.category),
            func.sum(Expense.amount),
            func.sum(Expense.vat_amount),
            func.sum(Expense.total),
            func.count(Expense.id),
        )
        .group_by(func.lower(Expense.category))
        .order_by(func.sum(Expense.total).desc())
    )
    if month:
        stmt = stmt.where(Expense.month == month)
    if year:
        stmt = stmt.where(Expense.year == year)
    return [
        CategorySummary(
            category=r[0], total_amount=float(r[1]), total_vat=float(r[2]),
            grand_total=float(r[3]), expense_count=r[4],
        )
        for r in db.execute(stmt).all()
    ]


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ExpenseOut:
    person = db.get(Person, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    vat_amount, total = _compute_vat(payload.amount, payload.vat_applied)
    expense = Expense(
        person_id=payload.person_id,
        category=_canonical_category(db, payload.category),
        reason=payload.reason,
        barcode=payload.barcode,
        amount=_money(payload.amount),
        vat_applied=payload.vat_applied,
        vat_amount=vat_amount,
        total=total,
        expense_date=payload.expense_date,
        month=payload.expense_date.month,
        year=payload.expense_date.year,
        created_by=user.id,
    )
    db.add(expense)
    db.flush()
    log_activity(db, user=user, action="created", entity="expense", entity_id=expense.id,
                 description=f"{person.name}: {expense.category} SAR {total:.2f}")
    db.commit()
    db.refresh(expense)
    return _to_out(expense)


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int, payload: ExpenseUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExpenseOut:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    data = payload.model_dump(exclude_unset=True)
    if "person_id" in data and not db.get(Person, data["person_id"]):
        raise HTTPException(status_code=404, detail="Person not found")
    for k, v in data.items():
        if k == "category" and isinstance(v, str):
            setattr(expense, k, _canonical_category(db, v))
        else:
            setattr(expense, k, v)
    if "expense_date" in data:
        expense.month = expense.expense_date.month
        expense.year = expense.expense_date.year
    # recompute VAT whenever amount or vat flag might have changed
    expense.vat_amount, expense.total = _compute_vat(float(expense.amount), expense.vat_applied)
    log_activity(db, user=user, action="updated", entity="expense", entity_id=expense.id,
                 description=f"Updated expense #{expense.id}")
    db.commit()
    db.refresh(expense)
    return _to_out(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    log_activity(db, user=user, action="deleted", entity="expense", entity_id=expense_id,
                 description=f"Deleted expense #{expense_id} ({expense.category})")
    db.delete(expense)
    db.commit()
