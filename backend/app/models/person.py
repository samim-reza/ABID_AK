from datetime import date

from sqlalchemy import Boolean, Date, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Person(Base, TimestampMixin):
    """An employee / person who incurs expenses and receives salary."""

    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    department: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    passport_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    iqama_number: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    iqama_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # where this office-staff member works: "inside" (in the office) or "outside"
    location: Mapped[str] = mapped_column(
        String(20), nullable=False, default="inside", server_default="inside"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    expenses = relationship("Expense", back_populates="person", cascade="all, delete-orphan")
    salaries = relationship("Salary", back_populates="person", cascade="all, delete-orphan")
