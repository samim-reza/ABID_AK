from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Invoice(Base, TimestampMixin):
    """A supplier/client invoice PDF filed under a company.

    Deliberately standalone: these amounts are never mixed into expenses,
    payroll or the dashboard — the invoice archive stands on its own.
    """

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )

    invoice_number: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)  # rate used at upload
    vat_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    invoice_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # --- stored PDF ---
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)  # original name
    stored_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checksum: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    company = relationship("Company")
