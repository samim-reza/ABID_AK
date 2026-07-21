from sqlalchemy.orm import Session

from app.models import Activity, User


def log_activity(
    db: Session,
    *,
    user: User | None,
    action: str,
    entity: str,
    entity_id: int | None = None,
    description: str = "",
) -> None:
    """Record an audit-trail entry. Caller is responsible for committing."""
    db.add(
        Activity(
            user_id=user.id if user else None,
            username=user.username if user else "system",
            action=action,
            entity=entity,
            entity_id=entity_id,
            description=description,
        )
    )
