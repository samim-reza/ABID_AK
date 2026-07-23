import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import (
    accounting,
    activity,
    auth,
    dashboard,
    expenses,
    invoices,
    persons,
    roles,
    salaries,
    users,
    workers,
)
from app.seed import run_seed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("abidak")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (fine for this app; swap to Alembic for larger migrations).
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        try:
            run_seed(db)
            logger.info("Database ready and seeded.")
        except Exception:  # pragma: no cover
            logger.exception("Seeding failed")
    yield


app = FastAPI(title=settings.project_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = settings.api_v1_prefix
for r in (auth, users, persons, roles, expenses, salaries, workers, activity, dashboard, invoices, accounting):
    app.include_router(r.router, prefix=api)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": settings.project_name}


@app.get("/", tags=["meta"])
def root() -> dict:
    return {"service": settings.project_name, "docs": "/docs", "health": "/health"}
