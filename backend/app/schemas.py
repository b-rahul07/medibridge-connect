"""
Pydantic schemas for request / response validation.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, EmailStr, Field


# ═══════════════════════════════════════════════════════════════════════
#  Auth
# ═══════════════════════════════════════════════════════════════════════
class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)
    role: Literal["doctor", "patient"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


# forward-ref fix (TokenResponse references UserOut)
TokenResponse.model_rebuild()


# ═══════════════════════════════════════════════════════════════════════
#  Sessions
# ═══════════════════════════════════════════════════════════════════════
class SessionCreateRequest(BaseModel):
    patient_language: Optional[str] = None


class SessionAcceptRequest(BaseModel):
    doctor_language: Optional[str] = None


class SessionOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: Optional[uuid.UUID] = None
    status: str
    patient_language: Optional[str] = None
    doctor_language: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    patient: Optional[UserOut] = None
    doctor: Optional[UserOut] = None

    class Config:
        from_attributes = True


class SessionEndRequest(BaseModel):
    summary: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════
#  Messages
# ═══════════════════════════════════════════════════════════════════════
class MessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    sender_id: uuid.UUID
    content: str
    translated_content: Optional[str] = None
    audio_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    content: str
    sender_language: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════
#  AI / Translation
# ═══════════════════════════════════════════════════════════════════════
class TranslateRequest(BaseModel):
    text: str
    target_language: str


class TranslateResponse(BaseModel):
    translated_text: str


class SummarizeRequest(BaseModel):
    session_id: uuid.UUID


class SummarizeResponse(BaseModel):
    summary: str
