from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Expense(Base, TimestampMixin):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True)

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vat_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    vat_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    expense_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    person = relationship("Person", back_populates="expenses")
