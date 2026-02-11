"""
Socket.IO event handlers for real-time messaging.

Implements a **two-phase broadcast** pattern:
  1. Persist the original message and emit ``new_message`` instantly.
  2. Translate via GPT-4o in the background, save, and emit ``message_updated``.
"""

import logging
import uuid
from datetime import datetime, timezone

import socketio
from sqlalchemy.orm import Session as DBSession

from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models.models import Message, Session as ConsultationSession
from app.services.ai_service import translate_text

logger = logging.getLogger(__name__)

# ── create async Socket.IO server ─────────────────────────────────────
from app.core.config import settings as _settings

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_settings.CORS_ORIGINS,
    logger=True,
    engineio_logger=False,
)


# ── helpers ────────────────────────────────────────────────────────────
def _get_db() -> DBSession:
    return SessionLocal()


# ── connection lifecycle ──────────────────────────────────────────────
@sio.event
async def connect(sid, environ, auth=None):
    """Authenticate on connect. Clients must send { token: "..." } as auth."""
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        # fallback to query string
        from urllib.parse import parse_qs

        qs = environ.get("QUERY_STRING", "")
        params = parse_qs(qs)
        token = params.get("token", [None])[0]

    if not token:
        logger.warning("Connection rejected — no token (sid=%s)", sid)
        return False

    try:
        payload = decode_token(token)
        user_id = payload["sub"]
        await sio.save_session(sid, {"user_id": user_id, "role": payload.get("role")})
        logger.info("Connected: user=%s, sid=%s", user_id, sid)
    except Exception as e:
        logger.warning("Auth failed: %s", e)
        return False


@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = session.get("user_id", "unknown") if session else "unknown"
    logger.info("Disconnected: user=%s, sid=%s", user_id, sid)


# ── join_room ─────────────────────────────────────────────────────────
@sio.event
async def join_room(sid, data):
    """Client sends { session_id: "<uuid>" }"""
    session_id = data.get("session_id")
    if not session_id:
        return

    # ── Authorisation: verify the user actually belongs to this session ──
    ws_session = await sio.get_session(sid)
    user_id = ws_session.get("user_id") if ws_session else None
    if not user_id:
        logger.warning("join_room rejected — no user_id in ws session (sid=%s)", sid)
        return

    db = _get_db()
    try:
        consultation = (
            db.query(ConsultationSession)
            .filter(ConsultationSession.id == uuid.UUID(session_id))
            .first()
        )
        if not consultation:
            logger.warning("join_room rejected — session %s not found (user=%s)", session_id, user_id)
            return
        if user_id not in (str(consultation.patient_id), str(consultation.doctor_id)):
            logger.warning(
                "join_room BLOCKED — user %s is not a participant of session %s",
                user_id, session_id,
            )
            return
    except Exception:
        logger.exception("join_room DB check failed")
        return
    finally:
        db.close()

    room = f"session_{session_id}"
    await sio.enter_room(sid, room)

    # Debug: list who is in the room now
    participants = sio.manager.get_participants('/', room)
    member_sids = [p for p in participants]
    logger.info("User %s joined room %s — members now: %s", user_id, room, member_sids)

    await sio.emit("user_joined", {"user_id": user_id}, room=room, skip_sid=sid)


# ── leave_room ────────────────────────────────────────────────────────
@sio.event
async def leave_room(sid, data):
    session_id = data.get("session_id")
    if not session_id:
        return
    room = f"session_{session_id}"
    await sio.leave_room(sid, room)
    logger.info("sid=%s left room %s", sid, room)


# ── send_message ──────────────────────────────────────────────────────
@sio.event
async def send_message(sid, data):
    """
    Two-phase broadcast for instant UX:
      Phase 1 — persist original text, broadcast immediately (translated_content=null)
      Phase 2 — translate via AI, save translation to DB, broadcast 'message_updated'
    """
    ws_session = await sio.get_session(sid)
    if not ws_session:
        return
    user_id = ws_session["user_id"]

    session_id = data.get("session_id")
    content = data.get("content", "")
    sender_language = data.get("sender_language")        # NEW: "I speak this"

    if not session_id or not content:
        return

    room = f"session_{session_id}"

    # ── Determine target language from the OTHER participant's language ──
    target_language = "en"  # fallback
    db = _get_db()
    try:
        consultation = (
            db.query(ConsultationSession)
            .filter(ConsultationSession.id == uuid.UUID(session_id))
            .first()
        )
        if consultation:
            is_patient = str(consultation.patient_id) == user_id
            if is_patient:
                # Patient is sending → translate into doctor's language
                target_language = consultation.doctor_language or "en"
                # Also persist/update the patient's language if provided
                if sender_language and consultation.patient_language != sender_language:
                    consultation.patient_language = sender_language
                    db.commit()
            else:
                # Doctor is sending → translate into patient's language
                target_language = consultation.patient_language or "en"
                if sender_language and consultation.doctor_language != sender_language:
                    consultation.doctor_language = sender_language
                    db.commit()
    except Exception:
        logger.exception("Failed to resolve target language from session")
    finally:
        db.close()

    try:
        # ── Phase 1: persist original & broadcast instantly ─────────
        db = _get_db()
        try:
            message = Message(
                session_id=uuid.UUID(session_id),
                sender_id=uuid.UUID(user_id),
                content=content,
                translated_content=None,
            )
            db.add(message)
            db.commit()
            db.refresh(message)
            msg_id = str(message.id)
            created_at = message.created_at.isoformat()
        finally:
            db.close()

        payload = {
            "id": msg_id,
            "session_id": str(session_id),
            "sender_id": str(user_id),
            "content": content,
            "translated_content": None,
            "audio_url": None,
            "created_at": created_at,
        }
        await sio.emit("new_message", payload, room=room)
        logger.info("Phase 1 done — instant broadcast for %s", msg_id)

        # ── Phase 2: translate, save to DB, push update ─────────────
        try:
            translated = await translate_text(content, target_language)
        except Exception:
            logger.exception("AI translation failed for %s — using fallback", msg_id)
            translated = "[Translation temporarily unavailable]"

        db = _get_db()
        try:
            row = db.query(Message).filter(Message.id == uuid.UUID(msg_id)).first()
            if row:
                row.translated_content = translated
                db.commit()
                logger.info("Phase 2 — translation saved to DB for %s", msg_id)
        finally:
            db.close()

        await sio.emit("message_updated", {
            "id": msg_id,
            "translated_content": translated,
        }, room=room)
        logger.info("Phase 2 done — translation broadcast for %s", msg_id)

    except Exception as e:
        logger.exception("send_message FAILED: %s", e)


# ── session_update — notify room of session status changes ────────────
async def broadcast_session_update(session_id: str, update_data: dict):
    """Utility called from REST routes to push real-time updates."""
    room = f"session_{session_id}"
    await sio.emit("session_update", update_data, room=room)
