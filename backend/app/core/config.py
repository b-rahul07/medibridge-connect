"""
MediBridge Connect — Backend Configuration

Loads environment variables from ``backend/.env`` and exposes a typed
``Settings`` singleton used by all other modules.
"""

import logging
import os
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from the backend directory
# __file__ = backend/app/core/config.py → .parent.parent.parent = backend/
_backend_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_backend_dir / ".env")


class Settings:
    """Application settings populated from environment variables."""

    # ── Database ───────────────────────────────────────────────────────
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:password@localhost:5432/medibridge"
    )

    # ── JWT ────────────────────────────────────────────────────────────
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRATION_MINUTES: int = int(os.getenv("JWT_EXPIRATION_MINUTES", "1440"))

    # ── AI / GitHub Models ─────────────────────────────────────────────
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    AI_ENDPOINT: str = os.getenv(
        "AI_ENDPOINT", "https://models.inference.ai.azure.com"
    )

    # ── Server ─────────────────────────────────────────────────────────
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    CORS_ORIGINS: list[str] = [
        origin.strip().rstrip("/")
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",")
        if origin.strip()
    ]

    # ── Uploads ────────────────────────────────────────────────────────
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    
    # ── Cloudinary (Cloud Storage) ─────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: str = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    CLOUDINARY_API_KEY: str = os.getenv("CLOUDINARY_API_KEY", "")
    CLOUDINARY_API_SECRET: str = os.getenv("CLOUDINARY_API_SECRET", "")
    USE_CLOUDINARY: bool = os.getenv("USE_CLOUDINARY", "false").lower() == "true"


settings = Settings()
