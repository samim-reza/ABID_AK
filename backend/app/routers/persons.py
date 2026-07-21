from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.activity_log import log_activity
from app.database import get_db
from app.deps import get_current_user
from app.models import Expense, Person, User
from app.schemas.common import Page
from app.schemas.person import PersonCreate, PersonOut, PersonSummary, PersonUpdate

router = APIRouter(prefix="/persons", tags=["persons"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[PersonOut])
def list_persons(
    db: Session = Depends(get_db),
    q: str | None = None,
    active_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[PersonOut]:
    stmt = select(Person)
    if q:
        stmt = stmt.where(Person.name.ilike(f"%{q}%"))
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
