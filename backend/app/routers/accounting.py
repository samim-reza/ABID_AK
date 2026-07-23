"""Double-entry accounting: chart of accounts, the general journal, fiscal
period control and the audit-facing financial reports.

Every report is derived from *posted* journal lines only, so the ledger is the
single source of truth an auditor can trace end to end.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.activity_log import log_activity
from app.database import get_db
from app.deps import get_current_admin, get_current_user
from app.models import Account, FiscalPeriod, JournalEntry, JournalLine, User
from app.schemas.accounting import (
    AccountCreate,
    AccountNode,
    AccountOut,
    AccountUpdate,
    BalanceSheet,
    FiscalPeriodOut,
    GeneralLedger,
    IncomeStatement,
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
    JournalLineOut,
    LedgerLine,
    ReportLine,
    ReportSection,
    TrialBalance,
    TrialBalanceRow,
)
from app.schemas.common import Page

router = APIRouter(
    prefix="/accounting", tags=["accounting"], dependencies=[Depends(get_current_user)]
)

DEBIT_NORMAL = {"asset", "expense"}
MIN_DATE = date(1900, 1, 1)
MAX_DATE = date(9999, 12, 31)


def _money(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# --- Chart of accounts ---------------------------------------------------------


def _account_out(a: Account) -> AccountOut:
    return AccountOut(
        id=a.id, code=a.code, name=a.name, account_type=a.account_type,
        parent_id=a.parent_id, is_group=a.is_group, is_active=a.is_active,
        description=a.description, normal_balance=a.normal_balance,
    )


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    account_type: str | None = None,
    postable_only: bool = False,
    active_only: bool = False,
) -> list[AccountOut]:
    """Flat account list, ordered by code — handy for pickers on journal lines."""
    stmt = select(Account)
    if account_type:
        stmt = stmt.where(Account.account_type == account_type)
    if postable_only:
        stmt = stmt.where(Account.is_group.is_(False))
    if active_only:
        stmt = stmt.where(Account.is_active.is_(True))
    rows = db.scalars(stmt.order_by(Account.code)).all()
    return [_account_out(a) for a in rows]


@router.get("/accounts/tree", response_model=list[AccountNode])
def account_tree(db: Session = Depends(get_db)) -> list[AccountNode]:
    """The chart of accounts as a nested tree, each node carrying its balance."""
    accounts = db.scalars(select(Account).order_by(Account.code)).all()
    balances = _signed_balances(db)

    nodes: dict[int, AccountNode] = {}
    for a in accounts:
        node = AccountNode(**_account_out(a).model_dump(), balance=0.0, children=[])
        node.balance = _money(balances.get(a.id, 0.0))
        nodes[a.id] = node

    roots: list[AccountNode] = []
    for a in accounts:
        node = nodes[a.id]
        if a.parent_id and a.parent_id in nodes:
            nodes[a.parent_id].children.append(node)
        else:
            roots.append(node)

    # Roll group-account balances up from their descendants.
    def roll(n: AccountNode) -> float:
        total = n.balance if not n.children else 0.0
        for c in n.children:
            total += roll(c)
        n.balance = _money(total)
        return total

    for r in roots:
        roll(r)
    return roots


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate, db: Session = Depends(get_db), user: User = Depends(get_current_admin)
) -> AccountOut:
    code = payload.code.strip()
    if db.scalar(select(Account).where(Account.code == code)):
        raise HTTPException(status_code=409, detail=f"Account code {code} already exists")
    if payload.parent_id:
        parent = db.get(Account, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent account not found")
        if parent.account_type != payload.account_type:
            raise HTTPException(
                status_code=400,
                detail="Account must share its parent's type",
            )
    account = Account(
        code=code, name=payload.name.strip(), account_type=payload.account_type,
        parent_id=payload.parent_id, is_group=payload.is_group,
        is_active=payload.is_active, description=payload.description.strip(),
    )
    db.add(account)
    db.flush()
    log_activity(db, user=user, action="created", entity="account", entity_id=account.id,
                 description=f"Account {account.code} — {account.name}")
    db.commit()
    db.refresh(account)
    return _account_out(account)


@router.patch("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, payload: AccountUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
) -> AccountOut:
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    data = payload.model_dump(exclude_unset=True)
    has_lines = db.scalar(select(func.count()).select_from(JournalLine).where(
        JournalLine.account_id == account_id))
    if has_lines and "account_type" in data and data["account_type"] != account.account_type:
        raise HTTPException(status_code=400, detail="Cannot change the type of an account that has postings")
    if "code" in data and data["code"]:
        data["code"] = data["code"].strip()
        clash = db.scalar(select(Account).where(Account.code == data["code"], Account.id != account_id))
        if clash:
            raise HTTPException(status_code=409, detail=f"Account code {data['code']} already exists")
    if has_lines and data.get("is_group"):
        raise HTTPException(status_code=400, detail="An account with postings cannot become a group")
    for k, v in data.items():
        setattr(account, k, v.strip() if isinstance(v, str) else v)
    log_activity(db, user=user, action="updated", entity="account", entity_id=account.id,
                 description=f"Account {account.code} — {account.name}")
    db.commit()
    db.refresh(account)
    return _account_out(account)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_admin)
) -> None:
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if db.scalar(select(func.count()).select_from(JournalLine).where(JournalLine.account_id == account_id)):
        raise HTTPException(status_code=400, detail="Account has postings and cannot be deleted; deactivate it instead")
    if db.scalar(select(func.count()).select_from(Account).where(Account.parent_id == account_id)):
        raise HTTPException(status_code=400, detail="Account has child accounts; remove them first")
    log_activity(db, user=user, action="deleted", entity="account", entity_id=account_id,
                 description=f"Account {account.code} — {account.name}")
    db.delete(account)
    db.commit()


# --- Journal helpers -----------------------------------------------------------


def _period(db: Session, d: date) -> FiscalPeriod | None:
    return db.scalar(select(FiscalPeriod).where(FiscalPeriod.year == d.year, FiscalPeriod.month == d.month))


def _guard_open_period(db: Session, d: date) -> None:
    period = _period(db, d)
    if period and period.is_closed:
        raise HTTPException(
            status_code=400,
            detail=f"Period {d.year}-{d.month:02d} is closed; reopen it before posting here",
        )


def _next_entry_no(db: Session, year: int) -> str:
    count = db.scalar(select(func.count()).select_from(JournalEntry).where(JournalEntry.year == year)) or 0
    return f"JV-{year}-{count + 1:05d}"


def _validate_lines(db: Session, lines) -> list[dict]:
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="A journal entry needs at least two lines")
    total_debit = total_credit = Decimal("0")
    prepared: list[dict] = []
    for i, ln in enumerate(lines, start=1):
        debit, credit = _money(ln.debit), _money(ln.credit)
        if debit > 0 and credit > 0:
            raise HTTPException(status_code=400, detail=f"Line {i} cannot have both a debit and a credit")
        if debit == 0 and credit == 0:
            raise HTTPException(status_code=400, detail=f"Line {i} needs a debit or a credit amount")
        account = db.get(Account, ln.account_id)
        if not account:
            raise HTTPException(status_code=404, detail=f"Line {i}: account {ln.account_id} not found")
        if account.is_group:
            raise HTTPException(status_code=400, detail=f"Line {i}: cannot post to group account {account.code}")
        if not account.is_active:
            raise HTTPException(status_code=400, detail=f"Line {i}: account {account.code} is inactive")
        total_debit += Decimal(str(debit))
        total_credit += Decimal(str(credit))
        prepared.append({"account_id": ln.account_id, "line_no": i,
                         "description": ln.description.strip(), "debit": debit, "credit": credit})
    if total_debit != total_credit:
        raise HTTPException(
            status_code=400,
            detail=f"Entry is out of balance: debits {total_debit} ≠ credits {total_credit}",
        )
    if total_debit == 0:
        raise HTTPException(status_code=400, detail="Entry total cannot be zero")
    return prepared


def _entry_out(entry: JournalEntry) -> JournalEntryOut:
    out = JournalEntryOut(
        id=entry.id, entry_no=entry.entry_no, entry_date=entry.entry_date,
        year=entry.year, month=entry.month, memo=entry.memo, reference=entry.reference,
        source=entry.source, status=entry.status, total_debit=_money(entry.total_debit),
        total_credit=_money(entry.total_credit), posted_at=entry.posted_at,
        created_at=entry.created_at, lines=[],
    )
    out.lines = [
        JournalLineOut(
            id=ln.id, account_id=ln.account_id,
            account_code=ln.account.code if ln.account else None,
            account_name=ln.account.name if ln.account else None,
            line_no=ln.line_no, description=ln.description,
            debit=float(ln.debit), credit=float(ln.credit),
        )
        for ln in entry.lines
    ]
    return out


# --- Journal endpoints ---------------------------------------------------------


@router.get("/journal", response_model=Page[JournalEntryOut])
def list_journal(
    db: Session = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[JournalEntryOut]:
    stmt = select(JournalEntry)
    if status_filter:
        stmt = stmt.where(JournalEntry.status == status_filter)
    if month:
        stmt = stmt.where(JournalEntry.month == month)
    if year:
        stmt = stmt.where(JournalEntry.year == year)
    if search:
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(JournalEntry.entry_no).like(like)
            | func.lower(JournalEntry.memo).like(like)
            | func.lower(func.coalesce(JournalEntry.reference, "")).like(like)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.options(selectinload(JournalEntry.lines).selectinload(JournalLine.account))
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([_entry_out(r) for r in rows], total, page, page_size)


@router.get("/journal/{entry_id}", response_model=JournalEntryOut)
def get_journal(entry_id: int, db: Session = Depends(get_db)) -> JournalEntryOut:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return _entry_out(entry)


@router.post("/journal", response_model=JournalEntryOut, status_code=status.HTTP_201_CREATED)
def create_journal(
    payload: JournalEntryCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> JournalEntryOut:
    _guard_open_period(db, payload.entry_date)
    prepared = _validate_lines(db, payload.lines)
    entry = JournalEntry(
        entry_no=_next_entry_no(db, payload.entry_date.year),
        entry_date=payload.entry_date, year=payload.entry_date.year, month=payload.entry_date.month,
        memo=payload.memo.strip(), reference=(payload.reference or "").strip() or None,
        source="manual", status="posted" if payload.post else "draft",
        created_by=user.id,
    )
    if payload.post:
        entry.posted_at = func.now()
    entry.lines = [JournalLine(**ln) for ln in prepared]
    db.add(entry)
    db.flush()
    log_activity(db, user=user, action="posted" if payload.post else "created", entity="journal",
                 entity_id=entry.id, description=f"{entry.entry_no}: {entry.memo or 'journal entry'}")
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.patch("/journal/{entry_id}", response_model=JournalEntryOut)
def update_journal(
    entry_id: int, payload: JournalEntryUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JournalEntryOut:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft entries can be edited; void and re-key a posted entry")
    data = payload.model_dump(exclude_unset=True)
    new_date = data.get("entry_date", entry.entry_date)
    _guard_open_period(db, new_date)
    if "entry_date" in data:
        entry.entry_date = new_date
        entry.year, entry.month = new_date.year, new_date.month
    if "memo" in data:
        entry.memo = (data["memo"] or "").strip()
    if "reference" in data:
        entry.reference = (data["reference"] or "").strip() or None
    if payload.lines is not None:
        prepared = _validate_lines(db, payload.lines)
        entry.lines = [JournalLine(**ln) for ln in prepared]
    log_activity(db, user=user, action="updated", entity="journal", entity_id=entry.id,
                 description=f"{entry.entry_no}: {entry.memo or 'journal entry'}")
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.post("/journal/{entry_id}/post", response_model=JournalEntryOut)
def post_journal(
    entry_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> JournalEntryOut:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status == "posted":
        raise HTTPException(status_code=400, detail="Entry is already posted")
    if entry.status == "void":
        raise HTTPException(status_code=400, detail="A voided entry cannot be posted")
    _guard_open_period(db, entry.entry_date)
    _validate_lines(db, entry.lines)  # re-check the balance before it hits the ledger
    entry.status = "posted"
    entry.posted_at = func.now()
    log_activity(db, user=user, action="posted", entity="journal", entity_id=entry.id,
                 description=f"{entry.entry_no}: {entry.memo or 'journal entry'}")
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.post("/journal/{entry_id}/void", response_model=JournalEntryOut)
def void_journal(
    entry_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> JournalEntryOut:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status == "void":
        raise HTTPException(status_code=400, detail="Entry is already void")
    _guard_open_period(db, entry.entry_date)
    entry.status = "void"
    log_activity(db, user=user, action="voided", entity="journal", entity_id=entry.id,
                 description=f"{entry.entry_no}: {entry.memo or 'journal entry'}")
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.delete("/journal/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal(
    entry_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status == "posted":
        raise HTTPException(status_code=400, detail="Posted entries cannot be deleted; void the entry to keep the audit trail")
    log_activity(db, user=user, action="deleted", entity="journal", entity_id=entry_id,
                 description=f"{entry.entry_no}: {entry.memo or 'journal entry'}")
    db.delete(entry)
    db.commit()


# --- Fiscal periods ------------------------------------------------------------


@router.get("/periods", response_model=list[FiscalPeriodOut])
def list_periods(db: Session = Depends(get_db), year: int | None = None) -> list[FiscalPeriodOut]:
    stmt = select(FiscalPeriod)
    if year:
        stmt = stmt.where(FiscalPeriod.year == year)
    rows = db.scalars(stmt.order_by(FiscalPeriod.year.desc(), FiscalPeriod.month)).all()
    return [FiscalPeriodOut.model_validate(r) for r in rows]


@router.post("/periods/{year}/{month}/close", response_model=FiscalPeriodOut)
def close_period(
    year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_admin)
) -> FiscalPeriodOut:
    if not 1 <= month <= 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    period = db.scalar(select(FiscalPeriod).where(FiscalPeriod.year == year, FiscalPeriod.month == month))
    if not period:
        period = FiscalPeriod(year=year, month=month)
        db.add(period)
    draft = db.scalar(select(func.count()).select_from(JournalEntry).where(
        JournalEntry.year == year, JournalEntry.month == month, JournalEntry.status == "draft"))
    if draft:
        raise HTTPException(status_code=400, detail=f"{draft} draft entr{'y' if draft == 1 else 'ies'} in this period must be posted or deleted first")
    period.is_closed = True
    period.closed_at = func.now()
    period.closed_by = user.id
    log_activity(db, user=user, action="closed", entity="period", entity_id=period.id,
                 description=f"Closed period {year}-{month:02d}")
    db.commit()
    db.refresh(period)
    return FiscalPeriodOut.model_validate(period)


@router.post("/periods/{year}/{month}/reopen", response_model=FiscalPeriodOut)
def reopen_period(
    year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_admin)
) -> FiscalPeriodOut:
    period = db.scalar(select(FiscalPeriod).where(FiscalPeriod.year == year, FiscalPeriod.month == month))
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    period.is_closed = False
    period.closed_at = None
    period.closed_by = None
    log_activity(db, user=user, action="reopened", entity="period", entity_id=period.id,
                 description=f"Reopened period {year}-{month:02d}")
    db.commit()
    db.refresh(period)
    return FiscalPeriodOut.model_validate(period)


# --- Reporting engine ----------------------------------------------------------


def _signed_balances(
    db: Session, *, frm: date | None = None, upto: date | None = None
) -> dict[int, float]:
    """Net balance per account over posted lines, signed by natural balance
    (debit-normal accounts positive when debits exceed credits, and vice versa).
    """
    conds = [JournalEntry.status == "posted"]
    if frm:
        conds.append(JournalEntry.entry_date >= frm)
    if upto:
        conds.append(JournalEntry.entry_date <= upto)
    stmt = (
        select(
            JournalLine.account_id,
            Account.account_type,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .where(and_(*conds))
        .group_by(JournalLine.account_id, Account.account_type)
    )
    out: dict[int, float] = {}
    for account_id, acct_type, debit, credit in db.execute(stmt).all():
        net = float(debit) - float(credit)
        out[account_id] = net if acct_type in DEBIT_NORMAL else -net
    return out


@router.get("/reports/trial-balance", response_model=TrialBalance)
def trial_balance(
    db: Session = Depends(get_db),
    from_date: date = Query(...),
    to_date: date = Query(...),
) -> TrialBalance:
    conds = [JournalEntry.status == "posted",
             JournalEntry.entry_date >= from_date, JournalEntry.entry_date <= to_date]
    stmt = (
        select(
            Account.id, Account.code, Account.name, Account.account_type,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .join(JournalLine, JournalLine.account_id == Account.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(and_(*conds))
        .group_by(Account.id, Account.code, Account.name, Account.account_type)
        .order_by(Account.code)
    )
    rows: list[TrialBalanceRow] = []
    tot_d = tot_c = 0.0
    for acc_id, code, name, acc_type, debit, credit in db.execute(stmt).all():
        net = float(debit) - float(credit)
        d = _money(net) if net > 0 else 0.0
        c = _money(-net) if net < 0 else 0.0
        if d == 0 and c == 0:
            continue
        tot_d += d
        tot_c += c
        rows.append(TrialBalanceRow(account_id=acc_id, code=code, name=name,
                                    account_type=acc_type, debit=d, credit=c))
    return TrialBalance(from_date=from_date, to_date=to_date, rows=rows,
                        total_debit=_money(tot_d), total_credit=_money(tot_c))


@router.get("/reports/ledger/{account_id}", response_model=GeneralLedger)
def general_ledger(
    account_id: int, db: Session = Depends(get_db),
    from_date: date = Query(...), to_date: date = Query(...),
) -> GeneralLedger:
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    sign = 1 if account.account_type in DEBIT_NORMAL else -1

    opening_stmt = (
        select(func.coalesce(func.sum(JournalLine.debit), 0), func.coalesce(func.sum(JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalLine.account_id == account_id, JournalEntry.status == "posted",
               JournalEntry.entry_date < from_date)
    )
    od, oc = db.execute(opening_stmt).one()
    opening = sign * (float(od) - float(oc))

    line_stmt = (
        select(JournalEntry.entry_date, JournalEntry.entry_no, JournalEntry.id,
               JournalEntry.memo, JournalEntry.reference, JournalLine.debit, JournalLine.credit)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalLine.account_id == account_id, JournalEntry.status == "posted",
               JournalEntry.entry_date >= from_date, JournalEntry.entry_date <= to_date)
        .order_by(JournalEntry.entry_date, JournalEntry.id, JournalLine.line_no)
    )
    running = opening
    lines: list[LedgerLine] = []
    for edate, eno, eid, memo, ref, debit, credit in db.execute(line_stmt).all():
        running += sign * (float(debit) - float(credit))
        lines.append(LedgerLine(date=edate, entry_no=eno, entry_id=eid, memo=memo, reference=ref,
                                debit=float(debit), credit=float(credit), balance=_money(running)))
    return GeneralLedger(
        account_id=account_id, code=account.code, name=account.name,
        normal_balance=account.normal_balance, from_date=from_date, to_date=to_date,
        opening_balance=_money(opening), lines=lines, closing_balance=_money(running),
    )


def _section(db: Session, title: str, types: set[str], *, frm=None, upto=None) -> ReportSection:
    balances = _signed_balances(db, frm=frm, upto=upto)
    accounts = db.scalars(select(Account).where(Account.account_type.in_(types), Account.is_group.is_(False))
                          .order_by(Account.code)).all()
    lines: list[ReportLine] = []
    total = 0.0
    for a in accounts:
        amount = _money(balances.get(a.id, 0.0))
        if amount == 0:
            continue
        lines.append(ReportLine(account_id=a.id, code=a.code, name=a.name, amount=amount))
        total += amount
    return ReportSection(title=title, lines=lines, total=_money(total))


@router.get("/reports/income-statement", response_model=IncomeStatement)
def income_statement(
    db: Session = Depends(get_db), from_date: date = Query(...), to_date: date = Query(...)
) -> IncomeStatement:
    income = _section(db, "Income", {"income"}, frm=from_date, upto=to_date)
    expenses = _section(db, "Expenses", {"expense"}, frm=from_date, upto=to_date)
    return IncomeStatement(from_date=from_date, to_date=to_date, income=income, expenses=expenses,
                           net_profit=_money(income.total - expenses.total))


@router.get("/reports/balance-sheet", response_model=BalanceSheet)
def balance_sheet(db: Session = Depends(get_db), as_of: date = Query(...)) -> BalanceSheet:
    assets = _section(db, "Assets", {"asset"}, upto=as_of)
    liabilities = _section(db, "Liabilities", {"liability"}, upto=as_of)
    equity = _section(db, "Equity", {"equity"}, upto=as_of)
    # Retained earnings for the year-to-date fold into equity so the sheet ties.
    income = _section(db, "Income", {"income"}, upto=as_of)
    expenses = _section(db, "Expenses", {"expense"}, upto=as_of)
    net_profit = _money(income.total - expenses.total)
    total_le = _money(liabilities.total + equity.total + net_profit)
    return BalanceSheet(
        as_of=as_of, assets=assets, liabilities=liabilities, equity=equity,
        net_profit=net_profit, total_assets=assets.total,
        total_liabilities_equity=total_le,
        balanced=abs(assets.total - total_le) < 0.01,
    )
