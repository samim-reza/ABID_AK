from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Chart of Accounts ---------------------------------------------------------


class AccountBase(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=160)
    account_type: str = Field(pattern="^(asset|liability|equity|income|expense)$")
    parent_id: int | None = None
    is_group: bool = False
    is_active: bool = True
    description: str = Field(default="", max_length=255)


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    account_type: str | None = Field(default=None, pattern="^(asset|liability|equity|income|expense)$")
    parent_id: int | None = None
    is_group: bool | None = None
    is_active: bool | None = None
    description: str | None = Field(default=None, max_length=255)


class AccountOut(AccountBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    normal_balance: str


class AccountNode(AccountOut):
    """An account plus its computed balance and nested children (chart tree)."""

    balance: float = 0.0
    children: list["AccountNode"] = []


# --- Journal -------------------------------------------------------------------


class JournalLineIn(BaseModel):
    account_id: int
    description: str = Field(default="", max_length=255)
    debit: float = Field(default=0, ge=0)
    credit: float = Field(default=0, ge=0)


class JournalLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    account_code: str | None = None
    account_name: str | None = None
    line_no: int
    description: str
    debit: float
    credit: float


class JournalEntryCreate(BaseModel):
    entry_date: date
    memo: str = Field(default="", max_length=255)
    reference: str | None = Field(default=None, max_length=120)
    lines: list[JournalLineIn] = Field(min_length=2)
    post: bool = False  # post immediately instead of saving as draft


class JournalEntryUpdate(BaseModel):
    entry_date: date | None = None
    memo: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=120)
    lines: list[JournalLineIn] | None = Field(default=None, min_length=2)


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entry_no: str
    entry_date: date
    year: int
    month: int
    memo: str
    reference: str | None
    source: str
    status: str
    total_debit: float
    total_credit: float
    posted_at: datetime | None
    created_at: datetime
    lines: list[JournalLineOut] = []


# --- Fiscal periods ------------------------------------------------------------


class FiscalPeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    year: int
    month: int
    is_closed: bool
    closed_at: datetime | None


# --- Reports -------------------------------------------------------------------


class TrialBalanceRow(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    debit: float
    credit: float


class TrialBalance(BaseModel):
    from_date: date
    to_date: date
    rows: list[TrialBalanceRow]
    total_debit: float
    total_credit: float


class LedgerLine(BaseModel):
    date: date
    entry_no: str
    entry_id: int
    memo: str
    reference: str | None
    debit: float
    credit: float
    balance: float


class GeneralLedger(BaseModel):
    account_id: int
    code: str
    name: str
    normal_balance: str
    from_date: date
    to_date: date
    opening_balance: float
    lines: list[LedgerLine]
    closing_balance: float


class ReportLine(BaseModel):
    account_id: int
    code: str
    name: str
    amount: float


class ReportSection(BaseModel):
    title: str
    lines: list[ReportLine]
    total: float


class IncomeStatement(BaseModel):
    from_date: date
    to_date: date
    income: ReportSection
    expenses: ReportSection
    net_profit: float


class BalanceSheet(BaseModel):
    as_of: date
    assets: ReportSection
    liabilities: ReportSection
    equity: ReportSection
    net_profit: float  # current-period earnings folded into equity
    total_assets: float
    total_liabilities_equity: float
    balanced: bool
