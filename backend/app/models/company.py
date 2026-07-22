from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Company(Base, TimestampMixin):
    """A client / contractor company that workers are assigned to."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)

    projects = relationship(
        "Project", back_populates="company", cascade="all, delete-orphan"
    )
    workers = relationship("Worker", back_populates="company")


class Project(Base, TimestampMixin):
    """A project belonging to a company (e.g. Project 1, Project 2)."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    company = relationship("Company", back_populates="projects")
    workers = relationship("Worker", back_populates="project")
