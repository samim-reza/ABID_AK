from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
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
    monthly_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    expenses = relationship("Expense", back_populates="person", cascade="all, delete-orphan")
    salaries = relationship("Salary", back_populates="person", cascade="all, delete-orphan")
    payroll_records = relationship(
        "PersonSalary", back_populates="person", cascade="all, delete-orphan"
    )


class PersonSalary(Base, TimestampMixin):
    """One office-staff member's monthly pay: salary − advance."""

    __tablename__ = "person_salaries"
    __table_args__ = (
        UniqueConstraint("person_id", "year", "month", name="uq_person_salary_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="CASCADE"), index=True, nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    salary_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    advance_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pay_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    person = relationship("Person", back_populates="payroll_records")
