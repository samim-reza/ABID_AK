"""Seed demo worker data from `MOBILIZED HISTORY.xlsx`.

Idempotent: workers are keyed by iqama number (falling back to name), so it is
safe to re-run. Usage, from the backend/ directory:

    ./.venv/bin/python -m scripts.seed_workers            # default xlsx path
    ./.venv/bin/python -m scripts.seed_workers /path.xlsx
"""
from __future__ import annotations

import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Company, Project, Worker, WorkerSalary  # noqa: F401 (register models)

DEFAULT_XLSX = Path(__file__).resolve().parents[2] / "MOBILIZED HISTORY.xlsx"

# Client company that this manpower was mobilized to.
CLIENT = "JEL"
PAY_MONTH, PAY_YEAR = 7, 2026  # July 2026 demo payroll


def project_for(position: str) -> str:
    pos = (position or "").upper()
    if "BLAST" in pos:
        return "Sand Blasting"
    return "Painting"


def parse_rate(raw) -> float:
    if raw is None:
        return 0.0
    m = re.search(r"\d+(?:\.\d+)?", str(raw))
    return float(m.group()) if m else 0.0


def parse_advance(remark) -> float:
    """First number in a remark like '2800 (16/07/2026)' or 'ADVANCE 200 RIYAL'."""
    if not remark:
        return 0.0
    m = re.search(r"\d+(?:\.\d+)?", str(remark))
    return float(m.group()) if m else 0.0


def as_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def get_or_create_company(db, name: str) -> Company:
    c = db.scalar(select(Company).where(Company.name == name))
    if not c:
        c = Company(name=name)
        db.add(c)
        db.flush()
    return c


def get_or_create_project(db, company: Company, name: str) -> Project:
    p = db.scalar(
        select(Project).where(Project.company_id == company.id, Project.name == name)
    )
    if not p:
        p = Project(company_id=company.id, name=name)
        db.add(p)
        db.flush()
    return p


def main(xlsx_path: Path) -> None:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    # header is row index 10; worker rows follow
    records = [r for r in rows[11:] if r and r[1]]

    # ensure the worker-domain tables exist (idempotent)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    added_w = updated_w = added_s = 0
    try:
        client = get_or_create_company(db, CLIENT)

        for r in records:
            name = str(r[1]).strip().title()
            iqama = str(r[2]).strip() if r[2] is not None else None
            position = str(r[3]).strip() if r[3] else ""
            rate = parse_rate(r[4])
            passport = str(r[5]).strip() if r[5] else None
            nationality = (str(r[7]).strip().title() if r[7] else "")
            if nationality.upper().startswith("BANGLADESH"):
                nationality = "Bangladeshi"
            phone = str(r[8]).strip() if r[8] else None
            status = str(r[9]).strip().upper() if r[9] else ""
            iqama_exp = as_date(r[14])
            remark = r[19]
            released = status.startswith("RELESE") or status.startswith("RELEASE")

            project = get_or_create_project(db, client, project_for(position))

            worker = None
            if iqama:
                worker = db.scalar(select(Worker).where(Worker.iqama_number == iqama))
            if not worker:
                worker = db.scalar(
                    select(Worker).where(Worker.name == name, Worker.iqama_number.is_(None))
                )

            note = position + (f" · {remark}" if remark else "")
            fields = dict(
                name=name, nationality=nationality, passport_number=passport,
                iqama_number=iqama, iqama_expiry=iqama_exp, phone=phone,
                company_id=client.id, project_id=project.id,
                pay_type="hourly", base_rate=rate,
                is_released=released, released_at=date.today() if released else None,
                note=note.strip(" ·"),
            )
            if worker:
                for k, v in fields.items():
                    setattr(worker, k, v)
                updated_w += 1
            else:
                worker = Worker(**fields)
                db.add(worker)
                added_w += 1
            db.flush()

            # July 2026 demo pay for active workers (hourly ≈ 208 h/month)
            if not released:
                exists = db.scalar(
                    select(WorkerSalary).where(
                        WorkerSalary.worker_id == worker.id,
                        WorkerSalary.year == PAY_YEAR,
                        WorkerSalary.month == PAY_MONTH,
                    )
                )
                if not exists:
                    hours = 208
                    basic = round(rate * hours, 2)
                    overtime = round(rate * 1.5 * ((worker.id % 5) * 4), 2)  # 0–16 OT h
                    ot_hours = round(overtime / rate, 2) if rate else 0
                    advance = parse_advance(remark)
                    db.add(
                        WorkerSalary(
                            worker_id=worker.id, year=PAY_YEAR, month=PAY_MONTH,
                            basic_amount=basic, overtime_hours=ot_hours, overtime_amount=overtime,
                            advance_amount=advance, hours=hours,
                            paid=(worker.id % 3 != 0),  # ~2/3 marked paid
                            pay_date=date(PAY_YEAR, PAY_MONTH, 28),
                            note="Demo payroll",
                        )
                    )
                    added_s += 1

        db.commit()
        print(f"Companies ensured: {CLIENT} + {len(EXTRA_COMPANIES)} placeholders")
        print(f"Workers added: {added_w}, updated: {updated_w}")
        print(f"July {PAY_YEAR} pay records added: {added_s}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not path.exists():
        sys.exit(f"xlsx not found: {path}")
    main(path)
