from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Worker(Base, TimestampMixin):
    """A site worker assigned to a company & project, paid via monthly salary."""

    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    nationality: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    passport_number: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    iqama_number: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    iqama_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    # "monthly" (fixed basic salary) or "hourly" (paid per hour)
    pay_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="monthly", server_default="monthly"
    )
    # basic monthly salary, or the hourly rate when pay_type == "hourly"
    base_rate: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    is_released: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    released_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    company = relationship("Company", back_populates="workers")
    project = relationship("Project", back_populates="workers")
    salaries = relationship(
        "WorkerSalary", back_populates="worker", cascade="all, delete-orphan"
    )


class WorkerSalary(Base, TimestampMixin):
    """One worker's pay for a given month: basic + overtime − advance."""

    __tablename__ = "worker_salaries"
    __table_args__ = (
        UniqueConstraint("worker_id", "year", "month", name="uq_worker_salary_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    basic_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    overtime_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    advance_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    # hours worked (used for hourly workers; informational for monthly)
    hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pay_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    worker = relationship("Worker", back_populates="salaries")
