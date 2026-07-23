from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.activity_log import log_activity
from app.database import get_db
from app.deps import get_current_user
from app.models import Expense, Person, PersonSalary, User
from app.schemas.common import Page
from app.schemas.person import (
    PersonCreate,
    PersonOut,
    PersonPayrollRow,
    PersonSalaryOut,
    PersonSalaryUpsert,
    PersonSummary,
    PersonUpdate,
)

router = APIRouter(prefix="/persons", tags=["persons"], dependencies=[Depends(get_current_user)])


def _person_net(salary: float, advance: float) -> float:
    return float(salary) - float(advance)


@router.get("", response_model=Page[PersonOut])
def list_persons(
    db: Session = Depends(get_db),
    q: str | None = None,
    location: str | None = None,
    iqama_status: str | None = None,
    active_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[PersonOut]:
    stmt = select(Person)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Person.name.ilike(like)
            | Person.passport_number.ilike(like)
            | Person.iqama_number.ilike(like)
            | Person.email.ilike(like)
        )
    if location in ("inside", "outside"):
        stmt = stmt.where(Person.location == location)
    if iqama_status:
        today = date.today()
        soon = date.fromordinal(today.toordinal() + 30)
        if iqama_status == "expired":
            stmt = stmt.where(Person.iqama_expiry.is_not(None), Person.iqama_expiry < today)
        elif iqama_status == "expiring":
            stmt = stmt.where(
                Person.iqama_expiry.is_not(None),
                Person.iqama_expiry >= today,
                Person.iqama_expiry <= soon,
            )
        elif iqama_status == "valid":
            stmt = stmt.where(
                Person.iqama_expiry.is_(None) | (Person.iqama_expiry > soon)
            )
    if active_only:
        stmt = stmt.where(Person.is_active.is_(True))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Person.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page.create([PersonOut.model_validate(r) for r in rows], total, page, page_size)


@router.get("/summary", response_model=list[PersonSummary])
def persons_summary(
    db: Session = Depends(get_db),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
) -> list[PersonSummary]:
    """Per-person expense totals (used by the 'by person' aggregation view)."""
    stmt = (
        select(
            Person.id,
            Person.name,
            Person.role,
            Person.department,
            func.coalesce(func.sum(Expense.amount), 0),
            func.coalesce(func.sum(Expense.vat_amount), 0),
            func.coalesce(func.sum(Expense.total), 0),
            func.count(Expense.id),
        )
        .select_from(Person)
        .outerjoin(Expense, Expense.person_id == Person.id)
        .group_by(Person.id)
        .order_by(func.coalesce(func.sum(Expense.total), 0).desc())
    )
    if month:
        stmt = stmt.where(Expense.month == month)
    if year:
        stmt = stmt.where(Expense.year == year)

    return [
        PersonSummary(
            id=r[0], name=r[1], role=r[2], department=r[3],
            total_amount=float(r[4]), total_vat=float(r[5]),
            grand_total=float(r[6]), expense_count=r[7],
        )
        for r in db.execute(stmt).all()
    ]


# ======================================================================
# Office-staff monthly payroll (must be registered before /{person_id})
# ======================================================================


def _person_salary_out(s: PersonSalary) -> PersonSalaryOut:
    out = PersonSalaryOut.model_validate(s)
    out.person_name = s.person.name if s.person else None
    out.net_amount = _person_net(s.salary_amount, s.advance_amount)
    return out


@router.get("/payroll", response_model=list[PersonPayrollRow])
def payroll(
    db: Session = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    location: str | None = None,
    active_only: bool = True,
) -> list[PersonPayrollRow]:
    stmt = select(Person)
    if location in ("inside", "outside"):
        stmt = stmt.where(Person.location == location)
    if active_only:
        stmt = stmt.where(Person.is_active.is_(True))
    persons = db.scalars(stmt.order_by(Person.name)).all()

    sal_map = {
        s.person_id: s
        for s in db.scalars(
            select(PersonSalary).where(
                PersonSalary.year == year, PersonSalary.month == month
            )
        ).all()
    }

    rows: list[PersonPayrollRow] = []
    for p in persons:
        s = sal_map.get(p.id)
        monthly = float(p.monthly_salary)
        row = PersonPayrollRow(
            person_id=p.id, name=p.name, role=p.role, department=p.department,
            location=p.location, monthly_salary=monthly, is_active=p.is_active,
            suggested_salary=monthly,
        )
        if s:
            row.salary_id = s.id
            row.has_record = True
            row.salary_amount = float(s.salary_amount)
            row.advance_amount = float(s.advance_amount)
            row.net_amount = _person_net(s.salary_amount, s.advance_amount)
            row.paid = s.paid
        rows.append(row)
    return rows


@router.put("/salaries", response_model=PersonSalaryOut)
def upsert_salary(
    payload: PersonSalaryUpsert, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PersonSalaryOut:
    person = db.get(Person, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    salary = db.scalar(
        select(PersonSalary).where(
            PersonSalary.person_id == payload.person_id,
            PersonSalary.year == payload.year,
            PersonSalary.month == payload.month,
        )
    )
    creating = salary is None
    if creating:
        salary = PersonSalary(
            person_id=payload.person_id, year=payload.year, month=payload.month,
            created_by=user.id,
        )
        db.add(salary)
    salary.salary_amount = payload.salary_amount
    salary.advance_amount = payload.advance_amount
    salary.paid = payload.paid
    salary.pay_date = payload.pay_date
    salary.note = payload.note
    db.flush()
    net = _person_net(salary.salary_amount, salary.advance_amount)
    log_activity(
        db, user=user, action="created" if creating else "updated", entity="person_salary",
        entity_id=salary.id,
        description=f"{person.name} {payload.month:02d}/{payload.year}: net SAR {net:.2f}"
        f"{' (paid)' if payload.paid else ''}",
    )
    db.commit()
    db.refresh(salary)
    return _person_salary_out(salary)


@router.delete("/salaries/{salary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salary(
    salary_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    salary = db.get(PersonSalary, salary_id)
    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")
    log_activity(db, user=user, action="deleted", entity="person_salary", entity_id=salary_id,
                 description=f"Deleted office-staff pay record #{salary_id}")
    db.delete(salary)
    db.commit()


@router.get("/{person_id}/salaries", response_model=list[PersonSalaryOut])
def person_salaries(
    person_id: int, db: Session = Depends(get_db), year: int | None = None
) -> list[PersonSalaryOut]:
    if not db.get(Person, person_id):
        raise HTTPException(status_code=404, detail="Person not found")
    stmt = select(PersonSalary).where(PersonSalary.person_id == person_id)
    if year:
        stmt = stmt.where(PersonSalary.year == year)
    rows = db.scalars(
        stmt.order_by(PersonSalary.year.desc(), PersonSalary.month.desc())
    ).all()
    return [_person_salary_out(r) for r in rows]


@router.get("/{person_id}", response_model=PersonOut)
def get_person(person_id: int, db: Session = Depends(get_db)) -> Person:
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(
    payload: PersonCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Person:
    person = Person(**payload.model_dump())
    db.add(person)
    db.flush()
    log_activity(db, user=user, action="created", entity="person", entity_id=person.id,
                 description=f"Added person {person.name}")
    db.commit()
    db.refresh(person)
    return person


@router.patch("/{person_id}", response_model=PersonOut)
def update_person(
    person_id: int, payload: PersonUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Person:
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(person, k, v)
    log_activity(db, user=user, action="updated", entity="person", entity_id=person.id,
                 description=f"Updated person {person.name}")
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(
    person_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    name = person.name
    log_activity(db, user=user, action="deleted", entity="person", entity_id=person_id,
                 description=f"Deleted person {name} (and related records)")
    db.delete(person)
    db.commit()
