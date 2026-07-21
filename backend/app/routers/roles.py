from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Role
from app.schemas.role import RoleOut

router = APIRouter(prefix="/roles", tags=["roles"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db)) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.department, Role.name)))
