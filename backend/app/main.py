import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from apscheduler.schedulers.background import BackgroundScheduler

from app.api.routes import assistant, auth, disruptions, health, recovery, trips
from app.config import get_settings
from app.core.logging_config import configure_logging
from app.core.middleware import RequestTimingMiddleware
from app.core.rate_limiting import limiter
from app.database.base import Base
from app.database.seed import seed_if_empty
from app.database.session import SessionLocal, engine, resolved_url
from app.services.risk_prediction_service import run_risk_prediction_cycle

# Import models so they register on Base.metadata before create_all runs.
from app import models  # noqa: F401

logger = logging.getLogger("triprescue")


def _scheduled_risk_prediction_job() -> None:
    db = SessionLocal()
    try:
        notifications = run_risk_prediction_cycle(db)
        logger.info("Risk prediction cycle completed: %d notification(s) produced", len(notifications))
    except Exception as exc:
        logger.exception("Error during scheduled risk prediction cycle: %s", exc)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging()
    settings.enforce_secure_auth_secret()  # fails closed outside development, see config.py
    if settings.uses_insecure_default_auth_secret:
        logger.warning(
            "AUTH_SECRET is still the insecure development default ('dev-secret-change-me'). "
            "Session tokens are forgeable. Set a real AUTH_SECRET before deploying anywhere "
            "other than local development."
        )
    if resolved_url.startswith("sqlite"):
        # SQLite dev convenience only. Postgres schema is Alembic-managed -
        # see backend/alembic/ - `create_all` must never run against it, so
        # a fresh deploy doesn't silently create an out-of-band schema that
        # alembic then thinks is already at some unknown revision.
        Base.metadata.create_all(bind=engine)
<<<<<<< HEAD
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()

    scheduler = None
    if settings.risk_prediction_enabled:
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            _scheduled_risk_prediction_job,
            "interval",
            minutes=settings.risk_prediction_interval_minutes,
        )
        scheduler.start()
        logger.info(
            "Risk prediction background scheduler started (interval: %d minutes)",
            settings.risk_prediction_interval_minutes,
        )

    try:
        yield
    finally:
        if scheduler is not None and scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("Risk prediction background scheduler shut down")
=======
    if settings.seed_demo_data:
        db = SessionLocal()
        try:
            seed_if_empty(db)
        finally:
            db.close()
    else:
        logger.info("SEED_DEMO_DATA is off; skipping demo traveler and demo trip seeding.")
    yield
>>>>>>> origin/shreya


def _init_error_tracking() -> None:
    dsn = get_settings().sentry_dsn
    if not dsn:
        return
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; error tracking is disabled.")
        return
    sentry_sdk.init(dsn=dsn)


# Must run before FastAPI() is constructed: Sentry's integrations patch
# Starlette's middleware stack, which lifespan startup is already too late for.
_init_error_tracking()

app = FastAPI(title="TripRescue API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(RequestTimingMiddleware)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Too many attempts. Please wait and try again."})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error. Please try again."})


app.include_router(health.router)
app.include_router(trips.router)
app.include_router(trips.geocode_router)
app.include_router(disruptions.router)
app.include_router(recovery.router)
app.include_router(assistant.router)
app.include_router(auth.router)
