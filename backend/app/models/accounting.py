"""Double-entry accounting core: chart of accounts, fiscal periods and the
general journal.

This is the audit backbone of the ERP. Every financial movement an auditor
cares about is a balanced :class:`JournalEntry` — total debits always equal
total credits — posted against accounts in the :class:`Account` tree. All of
the financial reports (trial balance, general ledger, P&L, balance sheet) are
derived purely from posted journal lines, so the ledger is the single source
of truth.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin

# The five natural account classes. Assets and expenses carry a debit normal
# balance; liabilities, equity and income carry a credit normal balance.
ACCOUNT_TYPES = ("asset", "liability", "equity", "income", "expense")
DEBIT_NORMAL = {"asset", "expense"}


class Account(Base, TimestampMixin):
    """A single line of the chart of accounts.

    Accounts form a tree via ``parent_id`` so the chart can be multi-level
    (e.g. Current Assets → Bank → Riyad Bank). ``is_group`` accounts are
    headers used only for grouping and reporting — you cannot post journal
    lines directly against them; only leaf accounts are postable.
    """

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    parent = relationship("Account", remote_side=[id], backref="children")

    @property
    def normal_balance(self) -> str:
        return "debit" if self.account_type in DEBIT_NORMAL else "credit"


class FiscalPeriod(Base, TimestampMixin):
    """One accounting month. Closing a period freezes it — no journal entry can
    be posted, edited or voided inside a closed period, which is exactly what an
    auditor expects after a period has been signed off.
    """

    __tablename__ = "fiscal_periods"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_period_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class JournalEntry(Base, TimestampMixin):
    """The header of a general-journal voucher. Its lines must balance before it
    can move from ``draft`` to ``posted``. Once posted it appears in every
    financial report; a ``void`` entry is kept for the audit trail but excluded
    from balances.
    """

    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_no: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    memo: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    reference: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    # "manual" for hand-keyed vouchers, otherwise the sub-ledger that produced it
    # (e.g. "invoice", "payroll") so system journals are distinguishable.
    source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="draft", index=True, nullable=False)

    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    lines = relationship(
        "JournalLine",
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="JournalLine.line_no",
    )

    @property
    def total_debit(self) -> float:
        return float(sum(float(line.debit) for line in self.lines))

    @property
    def total_credit(self) -> float:
        return float(sum(float(line.credit) for line in self.lines))


class JournalLine(Base):
    """A single debit or credit posting against one account. A line carries a
    value in exactly one of ``debit``/``credit`` — never both.
    """

    __tablename__ = "journal_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="CASCADE"), index=True, nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    line_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    debit: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    credit: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account")
