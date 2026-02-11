"""
MediBridge Connect — FastAPI application entry-point.

Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

The module exposes ``app`` — a Socket.IO ASGI app that wraps
the FastAPI instance and serves both REST and real-time endpoints.
"""

import logging
import os

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, Base
from app.sockets import sio

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

# ── FastAPI app ───────────────────────────────────────────────────────
api = FastAPI(
    title="MediBridge Connect API",
    version="1.0.0",
    description="Healthcare translation consultation backend",
)

# CORS
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── register REST routers ─────────────────────────────────────────────
from app.routes.auth import router as auth_router
from app.routes.consultations import router as consultations_router
from app.routes.chat import router as chat_router

api.include_router(auth_router)
api.include_router(consultations_router)
api.include_router(chat_router)

# ── serve uploaded audio files ────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
api.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── health check ──────────────────────────────────────────────────────
@api.get("/health")
def health():
    return {"status": "ok"}


# ── AI endpoints (translate + summarize) ──────────────────────────────
from app.schemas import TranslateRequest, TranslateResponse, SummarizeRequest, SummarizeResponse
from app.services.ai_service import translate_text, summarize_conversation
from app.auth import get_current_user
from app.models import User, Message, Session as ConsultationSession
from app.database import get_db
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
