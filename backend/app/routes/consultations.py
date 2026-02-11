"""
Consultation / session routes.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession, joinedload

from app.database import get_db
from app.models import User, Session as ConsultationSession, Message
from app.schemas import (
    SessionCreateRequest,
    SessionAcceptRequest,
    SessionEndRequest,
    SessionOut,
    MessageOut,
)
from app.auth import get_current_user

router = APIRouter(prefix="/consultations", tags=["consultations"])


# ── Create / request a consultation ──────────────────────────────────
@router.post("/request", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def request_consultation(
    body: SessionCreateRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Prevent duplicate: patient can only have one waiting or active session
    existing = (
        db.query(ConsultationSession)
        .filter(
            ConsultationSession.patient_id == current_user.id,
            ConsultationSession.status.in_(["waiting", "active"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="You already have an open consultation. Please wait for it to complete before creating a new one.",
        )

    session = ConsultationSession(
        patient_id=current_user.id,
        patient_language=body.patient_language,
        status="waiting",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _load_session(db, session.id)


# ── Accept / join a waiting consultation ─────────────────────────────
@router.put("/{session_id}/accept", response_model=SessionOut)
def accept_consultation(
    session_id: UUID,
    body: SessionAcceptRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can accept consultations")

    session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "waiting":
        raise HTTPException(status_code=400, detail="Session is no longer available")

    session.doctor_id = current_user.id
    session.doctor_language = body.doctor_language
    session.status = "active"
    db.commit()
    return _load_session(db, session.id)


# ── End a consultation ────────────────────────────────────────────────
@router.put("/{session_id}/end", response_model=SessionOut)
def end_consultation(
    session_id: UUID,
    body: SessionEndRequest,
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
        raise HTTPException(status_code=403, detail="Not a participant of this session")

    session.status = "completed"
    if body.summary:
        session.summary = body.summary
    db.commit()
    return _load_session(db, session.id)


# ── List sessions for current user ───────────────────────────────────
@router.get("/", response_model=List[SessionOut])
def list_sessions(
    status_filter: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ConsultationSession).options(
        joinedload(ConsultationSession.patient),
        joinedload(ConsultationSession.doctor),
    )

    if current_user.role == "doctor":
        # doctors see: their own sessions + unclaimed waiting sessions
        from sqlalchemy import or_

        q = q.filter(
            or_(
                ConsultationSession.doctor_id == current_user.id,
                (ConsultationSession.status == "waiting")
                & (ConsultationSession.doctor_id.is_(None)),
            )
        )
    else:
        q = q.filter(ConsultationSession.patient_id == current_user.id)

    if status_filter:
        q = q.filter(ConsultationSession.status == status_filter)

    q = q.order_by(ConsultationSession.created_at.desc())
    return [SessionOut.model_validate(s) for s in q.all()]


# ── Get single session ────────────────────────────────────────────────
@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: UUID,
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
    # Patients can only see their own sessions;
    # Doctors can see their own + unclaimed waiting sessions they might accept.
    if current_user.role == "patient" and session.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not a participant of this session")
    if current_user.role == "doctor":
        is_participant = session.doctor_id == current_user.id
        is_unclaimed = session.status == "waiting" and session.doctor_id is None
        if not is_participant and not is_unclaimed:
            raise HTTPException(status_code=403, detail="Not a participant of this session")
    return _load_session(db, session_id)


# ── Search individual messages across user's sessions ─────────────────
@router.get("/search/messages/detail", response_model=List[MessageOut])
def search_messages_detail(
    q: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return individual messages that match the query, limited to
    sessions the current user participates in."""
    from sqlalchemy import or_

    # Subquery: sessions the user is part of
    user_session_ids = (
        db.query(ConsultationSession.id)
        .filter(
            or_(
                ConsultationSession.patient_id == current_user.id,
                ConsultationSession.doctor_id == current_user.id,
            )
        )
        .subquery()
    )

    messages = (
        db.query(Message)
        .filter(
            Message.session_id.in_(user_session_ids),
            Message.content.ilike(f"%{q}%"),
            Message.audio_url.is_(None),  # skip audio-only rows
        )
        .order_by(Message.created_at.desc())
        .limit(50)
        .all()
    )
    return [MessageOut.model_validate(m) for m in messages]


# ── Search across messages in user's sessions ────────────────────────
@router.get("/search/messages", response_model=List[SessionOut])
def search_messages(
    q: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_
    from app.models import Message

    # find sessions where any message matches
    matching_session_ids = (
        db.query(Message.session_id)
        .filter(Message.content.ilike(f"%{q}%"))
        .distinct()
        .subquery()
    )

    sessions = (
        db.query(ConsultationSession)
        .options(
            joinedload(ConsultationSession.patient),
            joinedload(ConsultationSession.doctor),
        )
        .filter(ConsultationSession.id.in_(matching_session_ids))
        .filter(
            or_(
                ConsultationSession.patient_id == current_user.id,
                ConsultationSession.doctor_id == current_user.id,
            )
        )
        .order_by(ConsultationSession.created_at.desc())
        .all()
    )
    return [SessionOut.model_validate(s) for s in sessions]


# ── helper ────────────────────────────────────────────────────────────
def _load_session(db: DBSession, session_id: UUID) -> SessionOut:
    session = (
        db.query(ConsultationSession)
        .options(
            joinedload(ConsultationSession.patient),
            joinedload(ConsultationSession.doctor),
        )
        .filter(ConsultationSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionOut.model_validate(session)
