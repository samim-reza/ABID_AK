"""Idempotent seeding of the bootstrap admin user and company job roles.

Roles are sourced from the ABID AK Contracting Company manpower list (employee.pdf).
"""
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, FiscalPeriod, Role, User
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


# A standard, Saudi-market chart of accounts. Each tuple is
# (code, name, type, is_group, parent_code). Group accounts are headers you
# report on but never post to; leaf accounts are where journal lines land.
CHART_OF_ACCOUNTS: list[tuple[str, str, str, bool, str | None]] = [
    # 1 — Assets
    ("1000", "Assets", "asset", True, None),
    ("1100", "Current Assets", "asset", True, "1000"),
    ("1110", "Cash on Hand", "asset", False, "1100"),
    ("1120", "Petty Cash", "asset", False, "1100"),
    ("1130", "Bank — Current Account", "asset", False, "1100"),
    ("1140", "Accounts Receivable", "asset", False, "1100"),
    ("1150", "VAT Receivable (Input VAT)", "asset", False, "1100"),
    ("1160", "Prepaid Expenses", "asset", False, "1100"),
    ("1170", "Inventory", "asset", False, "1100"),
    ("1180", "Advances to Suppliers", "asset", False, "1100"),
    ("1500", "Non-Current Assets", "asset", True, "1000"),
    ("1510", "Property, Plant & Equipment", "asset", False, "1500"),
    ("1590", "Accumulated Depreciation", "asset", False, "1500"),
    # 2 — Liabilities
    ("2000", "Liabilities", "liability", True, None),
    ("2100", "Current Liabilities", "liability", True, "2000"),
    ("2110", "Accounts Payable", "liability", False, "2100"),
    ("2120", "VAT Payable (Output VAT)", "liability", False, "2100"),
    ("2130", "Accrued Salaries & Wages", "liability", False, "2100"),
    ("2140", "GOSI Payable", "liability", False, "2100"),
    ("2150", "Advances from Customers", "liability", False, "2100"),
    ("2500", "Non-Current Liabilities", "liability", True, "2000"),
    ("2510", "Loans Payable", "liability", False, "2500"),
    # 3 — Equity
    ("3000", "Equity", "equity", True, None),
    ("3010", "Share Capital", "equity", False, "3000"),
    ("3020", "Retained Earnings", "equity", False, "3000"),
    ("3030", "Owner's Drawings", "equity", False, "3000"),
    # 4 — Income
    ("4000", "Income", "income", True, None),
    ("4010", "Contracting Revenue", "income", False, "4000"),
    ("4020", "Manpower Supply Revenue", "income", False, "4000"),
    ("4090", "Other Income", "income", False, "4000"),
    # 5 — Expenses
    ("5000", "Expenses", "expense", True, None),
    ("5010", "Salaries & Wages", "expense", False, "5000"),
    ("5020", "Subcontractor Costs", "expense", False, "5000"),
    ("5030", "Materials & Consumables", "expense", False, "5000"),
    ("5040", "Equipment Rental", "expense", False, "5000"),
    ("5050", "Fuel & Transport", "expense", False, "5000"),
    ("5060", "Rent Expense", "expense", False, "5000"),
    ("5070", "Utilities", "expense", False, "5000"),
    ("5080", "Office & Administration", "expense", False, "5000"),
    ("5090", "Depreciation Expense", "expense", False, "5000"),
    ("5100", "Bank Charges", "expense", False, "5000"),
]


def seed_accounts(db: Session) -> int:
    """Create any missing chart-of-accounts rows. Idempotent: existing codes are
    left untouched, so a company can freely rename or extend the chart."""
    existing = {a.code: a for a in db.scalars(select(Account))}
    added = 0
    # Two passes so a child's parent always exists before we link it.
    for code, name, acc_type, is_group, _ in CHART_OF_ACCOUNTS:
        if code not in existing:
            acc = Account(code=code, name=name, account_type=acc_type, is_group=is_group)
            db.add(acc)
            existing[code] = acc
            added += 1
    if added:
        db.flush()
    for code, _, _, _, parent_code in CHART_OF_ACCOUNTS:
        acc = existing.get(code)
        if acc and parent_code and acc.parent_id is None:
            parent = existing.get(parent_code)
            if parent:
                acc.parent_id = parent.id
    if added:
        db.commit()
    return added


def seed_periods(db: Session) -> int:
    """Open the twelve months of the current fiscal year if none exist yet."""
    year = date.today().year
    if db.scalar(select(func.count()).select_from(FiscalPeriod).where(FiscalPeriod.year == year)):
        return 0
    for month in range(1, 13):
        db.add(FiscalPeriod(year=year, month=month, is_closed=False))
    db.commit()
    return 12


def run_seed(db: Session) -> None:
    ensure_schema(db)
    seed_admin(db)
    seed_roles(db)
    seed_accounts(db)
    seed_periods(db)
