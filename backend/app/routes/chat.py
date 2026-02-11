"""
Chat routes — message history + audio upload.
"""

import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User, Message, Session as ConsultationSession
from app.schemas import MessageOut
from app.auth import get_current_user
from app.config import settings

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
