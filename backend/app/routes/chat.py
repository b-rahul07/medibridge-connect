"""
Chat routes — message history, text send, and audio upload.
"""

import asyncio
import logging
import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession

from app.database import get_db, SessionLocal
from app.models import User, Message, Session as ConsultationSession
from app.schemas import MessageOut, SendMessageRequest
from app.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ── Get messages for a session ────────────────────────────────────────
@router.get("/{session_id}/messages", response_model=List[MessageOut])
def get_messages(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.patient_id != current_user.id and session.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not a participant")

    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [MessageOut.model_validate(m) for m in messages]


# ── helper: background translation + broadcast ────────────────────────
async def _translate_and_broadcast(
    msg_id: str,
    content: str,
    target_language: str,
    room: str,
):
    """Phase 2: translate text and broadcast 'message_updated' event."""
    from app.services.ai_service import translate_text
    from app.sockets import sio

    try:
        translated = await translate_text(content, target_language)
    except Exception:
        logger.exception("AI translation failed for %s — using fallback", msg_id)
        translated = "[Translation temporarily unavailable]"

    db = SessionLocal()
    try:
        row = db.query(Message).filter(Message.id == uuid.UUID(msg_id)).first()
        if row:
            row.translated_content = translated
            db.commit()
    finally:
        db.close()

    await sio.emit(
        "message_updated",
        {"id": msg_id, "translated_content": translated},
        room=room,
    )
    logger.info("REST send — translation broadcast for %s", msg_id)


# ── Send a text message (REST — reliable fallback) ───────────────────
@router.post("/{session_id}/send", response_model=MessageOut, status_code=201)
async def send_message_rest(
    session_id: uuid.UUID,
    body: SendMessageRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a message via REST, broadcast it via Socket.IO, and kick off
    background translation.  This endpoint serves as a **reliable
    alternative** to the Socket.IO ``send_message`` event — if the
    socket is disconnected the frontend can fall back here.
    """
    from app.sockets import sio

    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.patient_id != current_user.id and session.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not a participant")

    # ── Determine target language from the OTHER participant ──────
    is_patient = session.patient_id == current_user.id
    if is_patient:
        target_language = session.doctor_language or "en"
        if body.sender_language and session.patient_language != body.sender_language:
            session.patient_language = body.sender_language
    else:
        target_language = session.patient_language or "en"
        if body.sender_language and session.doctor_language != body.sender_language:
            session.doctor_language = body.sender_language

    # ── Persist the message ──────────────────────────────────────
    message = Message(
        session_id=session_id,
        sender_id=current_user.id,
        content=body.content,
        translated_content=None,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    msg_id = str(message.id)
    room = f"session_{str(session_id)}"

    # ── Phase 1: broadcast untranslated message instantly ─────────
    payload = {
        "id": msg_id,
        "session_id": str(session_id),
        "sender_id": str(current_user.id),
        "content": body.content,
        "translated_content": None,
        "audio_url": None,
        "created_at": message.created_at.isoformat(),
    }
    await sio.emit("new_message", payload, room=room)
    logger.info("REST send — Phase 1 broadcast for %s", msg_id)

    # ── Phase 2: translate in background ─────────────────────────
    asyncio.create_task(
        _translate_and_broadcast(msg_id, body.content, target_language, room)
    )

    return MessageOut.model_validate(message)


# ── Upload audio file ─────────────────────────────────────────────────
@router.post("/upload-audio", response_model=MessageOut, status_code=201)
async def upload_audio(
    session_id: str = Form(...),
    target_language: str = Form("en"),
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_service import transcribe_audio, translate_text

    sid = uuid.UUID(session_id)
    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == sid)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # save file
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = file.filename.split(".")[-1] if file.filename else "webm"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # transcribe
    transcript = await transcribe_audio(filepath)

    # translate the transcript
    translated = await translate_text(transcript, target_language)

    # persist message
    message = Message(
        session_id=sid,
        sender_id=current_user.id,
        content=transcript,
        translated_content=translated,
        audio_url=f"/uploads/{filename}",
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Broadcast the audio message via Socket.IO so the other participant
    # sees it in real-time (without needing a page refresh).
    from app.sockets import sio
    import asyncio

    room = f"session_{str(sid)}"
    payload = {
        "id": str(message.id),
        "session_id": str(message.session_id),
        "sender_id": str(message.sender_id),
        "content": message.content,
        "translated_content": message.translated_content,
        "audio_url": message.audio_url,
        "created_at": message.created_at.isoformat(),
    }
    await sio.emit("new_message", payload, room=room)

    return MessageOut.model_validate(message)
