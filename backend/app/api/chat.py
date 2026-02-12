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

from app.core.database import get_db, SessionLocal
from app.models.models import User, Message, Session as ConsultationSession
from app.schemas import MessageOut, SendMessageRequest
from app.core.security import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ── Get messages for a session ────────────────────────────────────────
@router.get("/{session_id}/messages", response_model=List[MessageOut])
def get_messages(
    session_id: uuid.UUID,
    limit: int = 50,
    cursor: str = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all messages for a consultation session with cursor-based pagination.

    Returns messages in chronological order (oldest first). Only participants
    (the patient and the assigned doctor) are authorized to view messages.

    Args:
        session_id (uuid.UUID): The consultation session ID.
        limit (int): Maximum number of messages to return (default: 50, max: 100).
        cursor (str): Optional message ID to use as pagination cursor for next page.
        db (DBSession): Database session dependency.
        current_user (User): Authenticated user from JWT token.

    Returns:
        List[MessageOut]: Ordered list of messages with original and translated content.

    Raises:
        HTTPException: 404 if session not found, 403 if user is not a participant, 400 for invalid cursor.
    """
    # Enforce maximum limit to prevent abuse
    if limit > 100:
        limit = 100
    
    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.patient_id != current_user.id and session.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Build query with cursor-based pagination
    query = db.query(Message).filter(Message.session_id == session_id)
    
    if cursor:
        # Cursor is the message ID from the previous page
        try:
            cursor_msg = db.query(Message).filter(Message.id == uuid.UUID(cursor)).first()
            if cursor_msg:
                # Get messages after this cursor's timestamp
                query = query.filter(Message.created_at > cursor_msg.created_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    
    messages = (
        query
        .order_by(Message.created_at.asc())
        .limit(limit)
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
    from app.services.socket_service import sio

    try:
        translated = await translate_text(content, target_language)
    except Exception:
        logger.exception("AI translation failed for %s — using original text", msg_id)
        translated = content  # graceful fallback: show original text

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
    """Send a text message via REST with two-phase Socket.IO broadcast.

    This endpoint serves as a reliable alternative to the Socket.IO `send_message`
    event. If the WebSocket is disconnected, the frontend falls back to this REST
    endpoint. The message is immediately broadcast untranslated (Phase 1), then
    GPT-4o translation runs in the background and broadcasts the translated version
    (Phase 2).

    The endpoint automatically detects the sender's role (patient/doctor) and
    determines the target language from the OTHER participant's language preference.
    If the sender provides a language preference, it updates the session record.

    Args:
        session_id (uuid.UUID): The consultation session ID.
        body (SendMessageRequest): Message content and optional sender language.
        db (DBSession): Database session dependency.
        current_user (User): Authenticated user from JWT token.

    Returns:
        MessageOut: The created message (without translated_content initially).

    Raises:
        HTTPException: 404 if session not found, 403 if user is not a participant.
    """
    from app.services.socket_service import sio

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
        actual_sender_language = session.patient_language or "en"
    else:
        target_language = session.patient_language or "en"
        if body.sender_language and session.doctor_language != body.sender_language:
            session.doctor_language = body.sender_language
        actual_sender_language = session.doctor_language or "en"

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
    # Skip translation if sender and target languages are the same
    if actual_sender_language.lower() == target_language.lower():
        logger.info("REST send — skipping translation, both languages are '%s'", target_language)
        # Update with original content immediately
        db_session = SessionLocal()
        try:
            row = db_session.query(Message).filter(Message.id == uuid.UUID(msg_id)).first()
            if row:
                row.translated_content = body.content
                db_session.commit()
        finally:
            db_session.close()
        await sio.emit("message_updated", {"id": msg_id, "translated_content": body.content}, room=room)
    else:
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
    """Process an audio message: save, transcribe, translate, and broadcast.

    This endpoint handles voice messages by:
    1. Saving the uploaded audio file to the local upload directory
    2. Transcribing the audio using Whisper large-v3-turbo
    3. Translating the transcript using GPT-4o
    4. Persisting the message with both the transcript and translation
    5. Broadcasting the complete message via Socket.IO for real-time delivery

    Unlike text messages (which use two-phase broadcast), audio messages are
    broadcast only once after both transcription and translation complete.

    Args:
        session_id (str): The consultation session ID (as form data).
        target_language (str): Target language code for translation (default: 'en').
        file (UploadFile): The audio file (webm, wav, mp3, etc.).
        db (DBSession): Database session dependency.
        current_user (User): Authenticated user from JWT token.

    Returns:
        MessageOut: The created message with transcript, translation, and audio URL.

    Raises:
        HTTPException: 404 if session not found.
        Exception: Logs and raises any file I/O or AI service errors.
    """
    from app.services.ai_service import transcribe_audio, translate_text

    sid = uuid.UUID(session_id)
    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == sid)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Determine sender and target languages
    is_patient = session.patient_id == current_user.id
    if is_patient:
        actual_target_language = session.doctor_language or "en"
        sender_language = session.patient_language or "en"
    else:
        actual_target_language = session.patient_language or "en"
        sender_language = session.doctor_language or "en"

    # save file
    ext = file.filename.split(".")[-1] if file.filename else "webm"
    filename = f"{uuid.uuid4()}.{ext}"
    
    content = await file.read()
    
    # Upload to Cloudinary if configured, otherwise use local storage
    if settings.USE_CLOUDINARY and settings.CLOUDINARY_CLOUD_NAME:
        import cloudinary
        import cloudinary.uploader
        
        # Configure Cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        
        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            content,
            resource_type="raw",
            folder="medibridge-audio",
            public_id=filename.rsplit(".", 1)[0],
        )
        audio_url = upload_result["secure_url"]
        logger.info("Audio uploaded to Cloudinary: %s", audio_url)
        
        # Save to temp file for transcription
        filepath = os.path.join(settings.UPLOAD_DIR, filename)
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        with open(filepath, "wb") as f:
            f.write(content)
    else:
        # Local storage fallback
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        filepath = os.path.join(settings.UPLOAD_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        audio_url = f"/uploads/{filename}"
        logger.info("Audio saved locally: %s", filepath)

    # transcribe
    transcript = await transcribe_audio(filepath)

    # translate the transcript (skip if sender and target languages match)
    if sender_language.lower() == actual_target_language.lower():
        logger.info("Audio upload — skipping translation, both languages are '%s'", actual_target_language)
        translated = transcript
    else:
        translated = await translate_text(transcript, actual_target_language)

    # persist message
    message = Message(
        session_id=sid,
        sender_id=current_user.id,
        content=transcript,
        translated_content=translated,
        audio_url=audio_url,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    # Clean up temp file if using Cloudinary
    if settings.USE_CLOUDINARY and settings.CLOUDINARY_CLOUD_NAME:
        try:
            os.remove(filepath)
        except Exception:
            logger.warning("Failed to remove temp audio file: %s", filepath)

    # Broadcast the audio message via Socket.IO so the other participant
    # sees it in real-time (without needing a page refresh).
    from app.services.socket_service import sio
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
