"""
SQLAlchemy ORM models for MediBridge Connect.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


# ── helpers ────────────────────────────────────────────────────────────
def _uuid():
    return uuid.uuid4()


def _utcnow():
    return datetime.now(timezone.utc)


# ── Users ──────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(
        SAEnum("doctor", "patient", name="user_role"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # relationships
    patient_sessions = relationship(
        "Session", foreign_keys="Session.patient_id", back_populates="patient"
    )
    doctor_sessions = relationship(
        "Session", foreign_keys="Session.doctor_id", back_populates="doctor"
    )
    messages = relationship("Message", back_populates="sender")


# ── Sessions (consultations) ──────────────────────────────────────────
class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    patient_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    doctor_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    status = Column(
        SAEnum("waiting", "active", "completed", name="session_status"),
        nullable=False,
        default="waiting",
    )
    patient_language = Column(String(10), nullable=True)
    doctor_language = Column(String(10), nullable=True)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # relationships
    patient = relationship("User", foreign_keys=[patient_id], back_populates="patient_sessions")
    doctor = relationship("User", foreign_keys=[doctor_id], back_populates="doctor_sessions")
    messages = relationship("Message", back_populates="session", order_by="Message.created_at")


# ── Messages ──────────────────────────────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True
    )
    sender_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    content = Column(Text, nullable=False)
    translated_content = Column(Text, nullable=True)
    audio_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # relationships
    session = relationship("Session", back_populates="messages")
    sender = relationship("User", back_populates="messages")
