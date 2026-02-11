"""
JWT token utilities and password hashing helpers.

Provides :func:`hash_password` / :func:`verify_password` (bcrypt),
:func:`create_access_token` / :func:`decode_token` (JWT), and the
:func:`get_current_user` FastAPI dependency.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.models.models import User

logger = logging.getLogger(__name__)

# ── password hashing ──────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

security = HTTPBearer()


def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return ``True`` if *plain* matches the bcrypt *hashed* value."""
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────────────────
def create_access_token(
    user_id: uuid.UUID,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT containing the user's id and role."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT.  Raises 401 on any validation failure."""
    try:
        return jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT token in an httpOnly cookie.
    
    Args:
        response: FastAPI Response object to set the cookie on.
        token: JWT token to store.
    """
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,  # Prevents JavaScript access (XSS protection)
        samesite="lax",  # CSRF protection
        secure=False,  # Set to True in production with HTTPS
        max_age=settings.JWT_EXPIRATION_MINUTES * 60,  # Convert minutes to seconds
        path="/",
    )


# ── FastAPI dependency ────────────────────────────────────
def get_current_user(
    request: Request,
    db: DBSession = Depends(get_db),
) -> User:
    """Dependency that extracts JWT from httpOnly cookie and returns the User row."""
    # Try to get token from httpOnly cookie first
    token = request.cookies.get("auth_token")
    
    # Fallback to Authorization header for backwards compatibility (Socket.IO, mobile)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Malformed user id in token")

    user = db.query(User).filter(User.id == parsed_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
