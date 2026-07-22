from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.activity_log import log_activity
from app.database import get_db
from app.deps import get_current_user
from app.models import Company, Invoice, Project, User, Worker, WorkerSalary
from app.schemas.common import Page
from app.schemas.worker import (
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    PayrollRow,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    WorkerCreate,
    WorkerOut,
    WorkerSalaryOut,
    WorkerSalaryUpsert,
    WorkerUpdate,
)

router = APIRouter(prefix="/workers", tags=["workers"], dependencies=[Depends(get_current_user)])

MONTHLY_HOURS = 260


def _net(basic: float, overtime: float, advance: float) -> float:
    return float(basic) + float(overtime) - float(advance)


def _default_basic(worker: Worker) -> float:
    rate = float(worker.base_rate)
    if worker.pay_type == "hourly":
        return round(rate * MONTHLY_HOURS, 2)
    return rate


def _overtime_hourly_rate(worker: Worker) -> float:
    rate = float(worker.base_rate)
    if worker.pay_type == "hourly":
        return rate
    return rate / MONTHLY_HOURS


def _calc_overtime_amount(worker: Worker, overtime_hours: float | None) -> float:
    if not overtime_hours:
        return 0.0
    return round(_overtime_hourly_rate(worker) * overtime_hours, 2)


# ======================================================================
# Companies & projects
# ======================================================================

@router.get("/companies", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db)) -> list[CompanyOut]:
    companies = db.scalars(
        select(Company).options(selectinload(Company.projects)).order_by(Company.name)
    ).all()
    # worker counts per company and per project
    wc = dict(
        db.execute(
            select(Worker.company_id, func.count(Worker.id)).group_by(Worker.company_id)
        ).all()
    )
    wp = dict(
        db.execute(
            select(Worker.project_id, func.count(Worker.id)).group_by(Worker.project_id)
        ).all()
    )
    out: list[CompanyOut] = []
    for c in companies:
        projects = [
            ProjectOut(id=p.id, company_id=p.company_id, name=p.name, worker_count=wp.get(p.id, 0))
            for p in sorted(c.projects, key=lambda x: x.name)
        ]
        out.append(CompanyOut(id=c.id, name=c.name, projects=projects, worker_count=wc.get(c.id, 0)))
    return out


@router.post("/companies", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CompanyOut:
    company = Company(name=payload.name.strip())
    db.add(company)
    db.flush()
    log_activity(db, user=user, action="created", entity="company", entity_id=company.id,
                 description=f"Added company {company.name}")
    db.commit()
    return CompanyOut(id=company.id, name=company.name, projects=[], worker_count=0)


@router.patch("/companies/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int, payload: CompanyUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CompanyOut:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.name = payload.name.strip()
    log_activity(db, user=user, action="updated", entity="company", entity_id=company.id,
                 description=f"Renamed company to {company.name}")
    db.commit()
    return CompanyOut(id=company.id, name=company.name, projects=[], worker_count=0)


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if db.scalar(select(func.count()).select_from(Worker).where(Worker.company_id == company_id)):
        raise HTTPException(status_code=400, detail="Remove or reassign this company's workers first")
    if db.scalar(select(func.count()).select_from(Invoice).where(Invoice.company_id == company_id)):
        raise HTTPException(status_code=400, detail="Delete this company's invoices first")
    name = company.name
    log_activity(db, user=user, action="deleted", entity="company", entity_id=company_id,
                 description=f"Deleted company {name}")
    db.delete(company)
    db.commit()


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProjectOut:
    if not db.get(Company, payload.company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    project = Project(company_id=payload.company_id, name=payload.name.strip())
    db.add(project)
    db.flush()
    log_activity(db, user=user, action="created", entity="project", entity_id=project.id,
                 description=f"Added project {project.name}")
    db.commit()
    return ProjectOut(id=project.id, company_id=project.company_id, name=project.name, worker_count=0)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.name = payload.name.strip()
    log_activity(db, user=user, action="updated", entity="project", entity_id=project.id,
                 description=f"Renamed project to {project.name}")
    db.commit()
    return ProjectOut(id=project.id, company_id=project.company_id, name=project.name, worker_count=0)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if db.scalar(select(func.count()).select_from(Worker).where(Worker.project_id == project_id)):
        raise HTTPException(status_code=400, detail="Remove or reassign this project's workers first")
    name = project.name
    log_activity(db, user=user, action="deleted", entity="project", entity_id=project_id,
                 description=f"Deleted project {name}")
    db.delete(project)
    db.commit()


# ======================================================================
# Workers
# ======================================================================

def _worker_out(w: Worker) -> WorkerOut:
    out = WorkerOut.model_validate(w)
    out.company_name = w.company.name if w.company else None
    out.project_name = w.project.name if w.project else None
    return out


@router.get("", response_model=Page[WorkerOut])
def list_workers(
    db: Session = Depends(get_db),
    q: str | None = None,
    company_id: int | None = None,
    project_id: int | None = None,
    include_released: bool = True,
    iqama_status: str | None = None,
    release_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> Page[WorkerOut]:
    stmt = select(Worker).options(
        selectinload(Worker.company), selectinload(Worker.project)
    )
    if company_id:
        stmt = stmt.where(Worker.company_id == company_id)
    if project_id:
        stmt = stmt.where(Worker.project_id == project_id)
    if not include_released:
        stmt = stmt.where(Worker.is_released.is_(False))
    if release_status == "released":
        stmt = stmt.where(Worker.is_released.is_(True))
    elif release_status == "active":
        stmt = stmt.where(Worker.is_released.is_(False))
    if iqama_status:
        today = date.today()
        soon = date.fromordinal(today.toordinal() + 30)
        if iqama_status == "expired":
            stmt = stmt.where(Worker.iqama_expiry.is_not(None), Worker.iqama_expiry < today)
        elif iqama_status == "expiring":
            stmt = stmt.where(
                Worker.iqama_expiry.is_not(None),
                Worker.iqama_expiry >= today,
                Worker.iqama_expiry <= soon,
            )
        elif iqama_status == "valid":
            stmt = stmt.where(
                Worker.iqama_expiry.is_(None) | (Worker.iqama_expiry > soon)
            )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Worker.name.ilike(like)
            | Worker.passport_number.ilike(like)
            | Worker.iqama_number.ilike(like)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Worker.is_released, Worker.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([_worker_out(r) for r in rows], total, page, page_size)


def _validate_placement(db: Session, company_id: int, project_id: int) -> None:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    project = db.get(Project, project_id)
    if not project or project.company_id != company_id:
        raise HTTPException(status_code=400, detail="Project does not belong to that company")


@router.post("", response_model=WorkerOut, status_code=status.HTTP_201_CREATED)
def create_worker(
    payload: WorkerCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> WorkerOut:
    _validate_placement(db, payload.company_id, payload.project_id)
    worker = Worker(**payload.model_dump())
    db.add(worker)
    db.flush()
    log_activity(db, user=user, action="created", entity="worker", entity_id=worker.id,
                 description=f"Added worker {worker.name}")
    db.commit()
    db.refresh(worker)
    return _worker_out(worker)


@router.patch("/{worker_id}", response_model=WorkerOut)
def update_worker(
    worker_id: int, payload: WorkerUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkerOut:
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    data = payload.model_dump(exclude_unset=True)
    new_company = data.get("company_id", worker.company_id)
    new_project = data.get("project_id", worker.project_id)
    if "company_id" in data or "project_id" in data:
        _validate_placement(db, new_company, new_project)
    for k, v in data.items():
        setattr(worker, k, v)
    log_activity(db, user=user, action="updated", entity="worker", entity_id=worker.id,
                 description=f"Updated worker {worker.name}")
    db.commit()
    db.refresh(worker)
    return _worker_out(worker)


@router.post("/{worker_id}/release", response_model=WorkerOut)
def release_worker(
    worker_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> WorkerOut:
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.is_released = True
    worker.released_at = date.today()
    log_activity(db, user=user, action="released", entity="worker", entity_id=worker.id,
                 description=f"Released worker {worker.name}")
    db.commit()
    db.refresh(worker)
    return _worker_out(worker)


@router.post("/{worker_id}/readd", response_model=WorkerOut)
def readd_worker(
    worker_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> WorkerOut:
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.is_released = False
    worker.released_at = None
    log_activity(db, user=user, action="re-added", entity="worker", entity_id=worker.id,
                 description=f"Re-added worker {worker.name}")
    db.commit()
    db.refresh(worker)
    return _worker_out(worker)


@router.delete("/{worker_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_worker(
    worker_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    name = worker.name
    log_activity(db, user=user, action="deleted", entity="worker", entity_id=worker_id,
                 description=f"Deleted worker {name} (and pay records)")
    db.delete(worker)
    db.commit()


# ======================================================================
# Worker salaries
# ======================================================================

def _salary_out(s: WorkerSalary) -> WorkerSalaryOut:
    out = WorkerSalaryOut.model_validate(s)
    out.worker_name = s.worker.name if s.worker else None
    out.net_amount = _net(s.basic_amount, s.overtime_amount, s.advance_amount)
    return out


@router.get("/{worker_id}/salaries", response_model=list[WorkerSalaryOut])
def worker_salaries(
    worker_id: int, db: Session = Depends(get_db), year: int | None = None
) -> list[WorkerSalaryOut]:
    if not db.get(Worker, worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")
    stmt = select(WorkerSalary).where(WorkerSalary.worker_id == worker_id)
    if year:
        stmt = stmt.where(WorkerSalary.year == year)
    rows = db.scalars(
        stmt.order_by(WorkerSalary.year.desc(), WorkerSalary.month.desc())
    ).all()
    return [_salary_out(r) for r in rows]


@router.put("/salaries", response_model=WorkerSalaryOut)
def upsert_salary(
    payload: WorkerSalaryUpsert, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkerSalaryOut:
    """Create or update a worker's pay record for a given month."""
    worker = db.get(Worker, payload.worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    salary = db.scalar(
        select(WorkerSalary).where(
            WorkerSalary.worker_id == payload.worker_id,
            WorkerSalary.year == payload.year,
            WorkerSalary.month == payload.month,
        )
    )
    creating = salary is None
    if creating:
        salary = WorkerSalary(
            worker_id=payload.worker_id, year=payload.year, month=payload.month,
            created_by=user.id,
        )
        db.add(salary)
    salary.basic_amount = payload.basic_amount
    salary.overtime_hours = payload.overtime_hours
    salary.overtime_amount = _calc_overtime_amount(worker, payload.overtime_hours)
    salary.advance_amount = payload.advance_amount
    salary.hours = payload.hours
    salary.paid = payload.paid
    salary.pay_date = payload.pay_date
    salary.note = payload.note
    db.flush()
    net = _net(salary.basic_amount, salary.overtime_amount, salary.advance_amount)
    log_activity(
        db, user=user, action="created" if creating else "updated", entity="worker_salary",
        entity_id=salary.id,
        description=f"{worker.name} {payload.month:02d}/{payload.year}: net SAR {net:.2f}"
        f"{' (paid)' if payload.paid else ''}",
    )
    db.commit()
    db.refresh(salary)
    return _salary_out(salary)


@router.delete("/salaries/{salary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salary(
    salary_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    salary = db.get(WorkerSalary, salary_id)
    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")
    log_activity(db, user=user, action="deleted", entity="worker_salary", entity_id=salary_id,
                 description=f"Deleted worker pay record #{salary_id}")
    db.delete(salary)
    db.commit()


@router.get("/payroll", response_model=list[PayrollRow])
def payroll(
    db: Session = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    company_id: int | None = None,
    project_id: int | None = None,
    include_released: bool = False,
) -> list[PayrollRow]:
    """Every worker joined with their pay record for the month (paid or not)."""
    stmt = select(Worker).options(
        selectinload(Worker.company), selectinload(Worker.project)
    )
    if company_id:
        stmt = stmt.where(Worker.company_id == company_id)
    if project_id:
        stmt = stmt.where(Worker.project_id == project_id)
    if not include_released:
        stmt = stmt.where(Worker.is_released.is_(False))
    workers = db.scalars(stmt.order_by(Worker.name)).all()

    sal_map = {
        s.worker_id: s
        for s in db.scalars(
            select(WorkerSalary).where(
                WorkerSalary.year == year, WorkerSalary.month == month
            )
        ).all()
    }

    rows: list[PayrollRow] = []
    for w in workers:
        s = sal_map.get(w.id)
        row = PayrollRow(
            worker_id=w.id, name=w.name, nationality=w.nationality,
            company_name=w.company.name if w.company else None,
            project_name=w.project.name if w.project else None,
            pay_type=w.pay_type, base_rate=float(w.base_rate), is_released=w.is_released,
            suggested_basic=_default_basic(w),
        )
        if s:
            row.salary_id = s.id
            row.has_record = True
            row.basic_amount = float(s.basic_amount)
            row.overtime_hours = float(s.overtime_hours) if s.overtime_hours is not None else None
            row.overtime_amount = float(s.overtime_amount)
            row.advance_amount = float(s.advance_amount)
            row.net_amount = _net(s.basic_amount, s.overtime_amount, s.advance_amount)
            row.paid = s.paid
        rows.append(row)
    return rows
