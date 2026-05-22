from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.routes import auth, clients, dashboards, integrations, settings, tasks
from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.models.entities import Integration
from app.services.integrations import run_mock_sync
from app.services.seed import seed_database

config = get_settings()
scheduler = AsyncIOScheduler()


def scheduled_sync() -> None:
    db = SessionLocal()
    try:
        integrations_to_sync = db.execute(select(Integration)).scalars().all()
        for integration in integrations_to_sync:
            run_mock_sync(db, integration)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if config.seed_demo_data:
            seed_database(db)

    scheduler.add_job(scheduled_sync, "interval", minutes=30, id="mock-platform-sync", replace_existing=True)
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title=config.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


app.include_router(auth.router, prefix=config.api_prefix)
app.include_router(clients.router, prefix=config.api_prefix)
app.include_router(dashboards.router, prefix=config.api_prefix)
app.include_router(integrations.router, prefix=config.api_prefix)
app.include_router(settings.router, prefix=config.api_prefix)
app.include_router(tasks.router, prefix=config.api_prefix)
