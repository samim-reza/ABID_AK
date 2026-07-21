from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Salary(Base, TimestampMixin):
    __tablename__ = "salaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    passport_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    # payment type: "salary" (regular), "ot" (overtime), "adv" (advance)
    pay_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="salary", server_default="salary"
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    pay_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    person = relationship("Person", back_populates="salaries")
