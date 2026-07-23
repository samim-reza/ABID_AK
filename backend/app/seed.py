"""Idempotent seeding of the bootstrap admin user and company job roles.

Roles are sourced from the ABID AK Contracting Company manpower list (employee.pdf).
"""
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Role, User
from app.security import hash_password

# department -> list of roles, taken from the company manpower list
ROLE_CATALOG: dict[str, list[str]] = {
    "Management": ["Chief Executive Officer (CEO)", "Marketing Manager", "Accountant", "Administrator"],
    "Technicians": [
        "Engine Mechanic", "Hydro & Chasis Mechanic", "Equipment Electrician", "Plant Electrician",
        "Tire Repairman", "Denter with Painter", "Service Mechanic",
    ],
    "Civil Department": [
        "Common Labor / Helper", "Carpenter", "Steel Fixer", "Rebar Fabricator", "Tiles Mason",
        "Concrete Mason", "Block Mason", "Plaster Mason", "Civil Foreman", "Civil Supervisor",
        "Civil QC/QC", "Plumber", "Plumber Foreman",
    ],
    "Rigging Department": ["Rigger Level I", "Rigger Level II", "Rigger Level III"],
    "Structural Department": [
        "Structural Fitter", "Structural Fabricator", "Structural Foreman",
        "Structural Supervisor", "Structural QA/QC",
    ],
    "Piping Department": [
        "Pipe Fitter", "Piping Fabricator", "Piping Foreman", "Piping Supervisor", "Piping QA/QC",
    ],
    "Scaffolding Department": ["Scaffolder", "Scaffolder Foreman", "Scaffolder Supervisor"],
    "Welding Department": ["Welder (3G)", "Welder (6G)", "TIG Welder (C.S)", "TIG Welder (S.S)"],
    "Painting Department": ["Sand Blaster", "Roller Painter", "Spray Painter", "Painter Foreman"],
    "E&I Department": [
        "Asst. Electrician", "Power Electrician", "Auto Electrician", "Electrician Foreman",
        "Electrician Supervisor", "Instrument Fitter", "Instrument Technician",
        "Instrument Foreman", "Instrument Supervisor", "E&I QA/QC",
    ],
    "Safety Department": [
        "Safety Manager", "Safety Supervisor", "Safety Officer", "WPR", "Permit Issuer",
    ],
    "Others": ["Stand by Man", "Flag Man", "Office boy / Tea boy", "Cleaner"],
    "Equipment Operator": [
        "Mixer Truck Driver (Concrete)", "Pay Loader Driver", "Dump Truck Driver (E-Portal)",
        "Dozer Operator", "Backhoe Loader Operator", "Cargo Crane Truck Operator",
        "Sprinkler Truck Driver", "Maintenance Truck Driver", "Fork Lift Operator",
        "Fuel Truck Driver", "Tractor with Lowbed Trailer Operator",
    ],
}


def seed_roles(db: Session) -> int:
    existing = {r.name for r in db.scalars(select(Role))}
    added = 0
    for department, roles in ROLE_CATALOG.items():
        for name in roles:
            if name not in existing:
                db.add(Role(name=name, department=department))
                added += 1
    if added:
        db.commit()
    return added


def seed_admin(db: Session) -> bool:
    if db.scalar(select(func.count()).select_from(User)):
        return False
    db.add(
        User(
            username=settings.admin_username,
            full_name=settings.admin_full_name,
            hashed_password=hash_password(settings.admin_password),
            is_admin=True,
            is_active=True,
        )
    )
    db.commit()
    return True


def ensure_schema(db: Session) -> None:
    """Lightweight, idempotent column additions for existing databases.

    Base.metadata.create_all only creates missing tables, not new columns on
    tables that already exist. These guarded ALTERs keep older deployments in
    sync without pulling in a full migration tool. Each statement runs in its
    own transaction so a no-op / unsupported dialect can't abort the rest.
    """
    statements = (
        "ALTER TABLE salaries "
        "ADD COLUMN IF NOT EXISTS pay_type VARCHAR(20) NOT NULL DEFAULT 'salary'",
        # Office-staff (persons) gained an email and an inside/outside-office location.
        "ALTER TABLE persons ADD COLUMN IF NOT EXISTS email VARCHAR(160)",
        "ALTER TABLE persons "
        "ADD COLUMN IF NOT EXISTS location VARCHAR(20) NOT NULL DEFAULT 'inside'",
        "ALTER TABLE worker_salaries "
        "ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(10, 2)",
        "ALTER TABLE persons ADD COLUMN IF NOT EXISTS iqama_number VARCHAR(64)",
        "ALTER TABLE persons ADD COLUMN IF NOT EXISTS iqama_expiry DATE",
        "ALTER TABLE persons "
        "ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0",
    )
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception:  # pragma: no cover - dialect/no-op differences
            db.rollback()


def run_seed(db: Session) -> None:
    ensure_schema(db)
    seed_admin(db)
    seed_roles(db)
