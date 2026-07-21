from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.activity_log import log_activity
from app.database import get_db
from app.deps import get_current_user
from app.models import Person, Salary, User
from app.schemas.common import Page
from app.schemas.salary import SalaryCreate, SalaryOut, SalaryUpdate

router = APIRouter(prefix="/salaries", tags=["salaries"], dependencies=[Depends(get_current_user)])


def _to_out(salary: Salary) -> SalaryOut:
    out = SalaryOut.model_validate(salary)
    out.person_name = salary.person.name if salary.person else None
    return out


@router.get("", response_model=Page[SalaryOut])
def list_salaries(
    db: Session = Depends(get_db),
    person_id: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[SalaryOut]:
    stmt = select(Salary)
    if person_id:
        stmt = stmt.where(Salary.person_id == person_id)
    if month:
        stmt = stmt.where(Salary.month == month)
    if year:
        stmt = stmt.where(Salary.year == year)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Salary.pay_date.desc(), Salary.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([_to_out(r) for r in rows], total, page, page_size)


@router.post("", response_model=SalaryOut, status_code=status.HTTP_201_CREATED)
def create_salary(
    payload: SalaryCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SalaryOut:
    person = db.get(Person, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    salary = Salary(
        person_id=payload.person_id,
        role=payload.role or person.role,
        passport_number=payload.passport_number,
        pay_type=payload.pay_type or "salary",
        amount=payload.amount,
        pay_date=payload.pay_date,
        month=payload.pay_date.month,
        year=payload.pay_date.year,
        note=payload.note,
        created_by=user.id,
    )
    db.add(salary)
    db.flush()
    log_activity(db, user=user, action="created", entity="salary", entity_id=salary.id,
                 description=f"Salary SAR {payload.amount:.2f} to {person.name} (passport {payload.passport_number})")
    db.commit()
    db.refresh(salary)
    return _to_out(salary)


@router.patch("/{salary_id}", response_model=SalaryOut)
def update_salary(
    salary_id: int, payload: SalaryUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SalaryOut:
    salary = db.get(Salary, salary_id)
    if not salary:
        raise HTTPException(status_code=404, detail="Salary not found")
    data = payload.model_dump(exclude_unset=True)
    if "person_id" in data and not db.get(Person, data["person_id"]):
        raise HTTPException(status_code=404, detail="Person not found")
    for k, v in data.items():
        setattr(salary, k, v)
    if "pay_date" in data:
        salary.month = salary.pay_date.month
        salary.year = salary.pay_date.year
    log_activity(db, user=user, action="updated", entity="salary", entity_id=salary.id,
                 description=f"Updated salary #{salary.id}")
    db.commit()
    db.refresh(salary)
    return _to_out(salary)


@router.delete("/{salary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salary(
    salary_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    salary = db.get(Salary, salary_id)
    if not salary:
        raise HTTPException(status_code=404, detail="Salary not found")
    log_activity(db, user=user, action="deleted", entity="salary", entity_id=salary_id,
                 description=f"Deleted salary #{salary_id}")
    db.delete(salary)
    db.commit()
