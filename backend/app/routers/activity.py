from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Activity
from app.schemas.activity import ActivityOut
from app.schemas.common import Page

router = APIRouter(prefix="/activity", tags=["activity"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[ActivityOut])
def list_activity(
    db: Session = Depends(get_db),
    entity: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> Page[ActivityOut]:
    stmt = select(Activity)
    if entity:
        stmt = stmt.where(Activity.entity == entity)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Activity.created_at.desc(), Activity.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([ActivityOut.model_validate(r) for r in rows], total, page, page_size)
