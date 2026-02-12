"""
MediBridge Connect — FastAPI application entry-point.

Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

The module exposes ``app`` — a Socket.IO ASGI app that wraps
the FastAPI instance and serves both REST and real-time endpoints.
"""

import logging
import os
import re
import time

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.services.socket_service import sio

# ── server start timestamp (for uptime calculation) ───────────────────
_SERVER_START_TIME = time.time()

logger = logging.getLogger(__name__)

# ── configure root logger (dev convenience) ───────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)

# ── create tables (dev convenience — use Alembic in production) ───────
Base.metadata.create_all(bind=engine)

if settings.JWT_SECRET == "change-me-in-production":
    logger.warning("⚠  JWT_SECRET is set to the default value — change it before deploying!")

logger.info("CORS_ORIGINS = %s", settings.CORS_ORIGINS)

# ── FastAPI app ───────────────────────────────────────────────────────
api = FastAPI(
    title="MediBridge Connect API",
    version="1.0.0",
    description="Healthcare translation consultation backend",
)

# ── CORS — must be registered FIRST (before any BaseHTTPMiddleware) ───
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Security Headers — added via @app.middleware to avoid breaking CORS
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none';"
    ),
}

# ── XSS Protection Pattern ───────────────────────────────────────────
_XSS_PATTERN = re.compile(
    r"<\s*script|javascript\s*:|on\w+\s*=",
    re.IGNORECASE,
)


@api.middleware("http")
async def security_and_xss_middleware(request: Request, call_next):
    """Combined security-headers + XSS-body-scan middleware.

    Uses @app.middleware('http') instead of BaseHTTPMiddleware so that
    CORSMiddleware headers are never stripped from the response.
    """
    # ── XSS body scan (POST / PUT / PATCH with JSON) ─────────────────
    if request.method in ("POST", "PUT", "PATCH"):
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            body_bytes = await request.body()
            if _XSS_PATTERN.search(body_bytes.decode("utf-8", errors="ignore")):
                logger.warning(
                    "XSS attempt blocked from %s on %s",
                    request.client.host if request.client else "unknown",
                    request.url.path,
                )
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Request rejected: potentially unsafe content detected."},
                )
            # Re-inject body so downstream handlers can read it
            async def _receive():
                return {"type": "http.request", "body": body_bytes}
            request._receive = _receive

    response = await call_next(request)

    # ── Append security headers ──────────────────────────────────────
    for key, value in _SECURITY_HEADERS.items():
        response.headers[key] = value

    return response

# ── register REST routers ─────────────────────────────────────────────
from app.api.auth import router as auth_router
from app.api.consultations import router as consultations_router
from app.api.chat import router as chat_router

api.include_router(auth_router)
api.include_router(consultations_router)
api.include_router(chat_router)

# ── serve uploaded audio files ────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
api.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── system health check ───────────────────────────────────────────────
from sqlalchemy import text as sa_text


@api.get("/health")
def health():
    """Comprehensive health check: database, AI service, and uptime."""
    db_status = "connected"
    ai_status = "available"
    overall = "healthy"

    # ── Database probe ────────────────────────────────────────────
    try:
        db = SessionLocal()
        db.execute(sa_text("SELECT 1"))
        db.close()
    except Exception as exc:
        logger.error("Health-check DB probe failed: %s", exc)
        db_status = "error"
        overall = "degraded"

    # ── AI service probe (key configured?) ────────────────────────
    if not settings.GITHUB_TOKEN:
        ai_status = "unavailable"
        overall = "degraded"

    # ── Uptime ────────────────────────────────────────────────────
    uptime_seconds = round(time.time() - _SERVER_START_TIME, 1)

    return {
        "status": overall,
        "database": db_status,
        "ai_service": ai_status,
        "uptime_seconds": uptime_seconds,
        "cors_origins": settings.CORS_ORIGINS,
    }


@api.get("/health/translate-test")
async def translate_test():
    """Quick smoke test: translate 'hello' to Spanish via the AI service."""
    from app.services.ai_service import translate_text
    try:
        result = await translate_text("hello", "es")
        return {"status": "ok", "input": "hello", "target": "es", "output": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ── AI endpoints (translate + summarize) ──────────────────────────────
from app.schemas import TranslateRequest, TranslateResponse, SummarizeRequest, SummarizeResponse
from app.services.ai_service import translate_text, summarize_conversation
from app.core.security import get_current_user
from app.models.models import User, Message, Session as ConsultationSession
from app.core.database import get_db
from fastapi import Depends
from sqlalchemy.orm import Session as DBSession


@api.post("/ai/translate", response_model=TranslateResponse)
async def translate_endpoint(
    body: TranslateRequest,
    current_user: User = Depends(get_current_user),
):
    """Translate a text snippet into the requested target language."""
    result = await translate_text(body.text, body.target_language)
    return TranslateResponse(translated_text=result)


@api.post("/ai/summarize", response_model=SummarizeResponse)
async def summarize_endpoint(
    body: SummarizeRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an AI clinical summary for a consultation session."""
    # Fetch the session first to get the doctor_id (avoids N+1 inside the loop)
    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == body.session_id)
        .first()
    )
    if not session:
        return SummarizeResponse(summary="Session not found.")

    messages = (
        db.query(Message)
        .filter(Message.session_id == body.session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    if not messages:
        return SummarizeResponse(summary="No messages to summarize.")

    doctor_id = session.doctor_id
    text = "\n".join(
        f"{'Doctor' if m.sender_id == doctor_id else 'Patient'}: {m.content}"
        for m in messages
    )
    summary = await summarize_conversation(text)

    # persist to session
    session.summary = summary
    db.commit()

    return SummarizeResponse(summary=summary)


# ── wrap FastAPI with Socket.IO ASGI app ──────────────────────────────
app = socketio.ASGIApp(sio, other_asgi_app=api)
