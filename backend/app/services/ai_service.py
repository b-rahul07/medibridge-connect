"""
AI service — GPT-4o translation, summarization & Whisper transcription.

All calls go through the GitHub Models endpoint.  When ``GITHUB_TOKEN``
is empty the functions return deterministic mock values so the rest of
the app can still be exercised without an API key.
"""

import logging
from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# ── client ─────────────────────────────────────────────────────────────
_client = AsyncOpenAI(
    base_url=settings.AI_ENDPOINT,
    api_key=settings.GITHUB_TOKEN,
)

TRANSLATION_MODEL = "gpt-4o"
WHISPER_MODEL = "whisper-large-v3-turbo"

# ── language code → full name mapping ─────────────────────────────────
LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "hi": "Hindi",
    "fr": "French",
    "de": "German",
    "zh": "Chinese",
    "ja": "Japanese",
    "ar": "Arabic",
    "pt": "Portuguese",
    "ru": "Russian",
}


def _resolve_language(code: str) -> str:
    """Return a human-readable language name for a given code."""
    return LANGUAGE_NAMES.get(code.lower().strip(), code)


# ── Translation ───────────────────────────────────────────────────────
async def translate_text(text: str, target_language: str) -> str:
    """Translate medical text into the target language using GPT-4o.

    Uses a strict system prompt to ensure the model only translates without
    answering questions or providing explanations. Language codes are mapped
    to full names (e.g., 'hi' → 'Hindi') to avoid ambiguity with greetings.

    Args:
        text (str): The source text to translate.
        target_language (str): ISO 639-1 language code (e.g., 'es', 'hi', 'fr').

    Returns:
        str: The translated text in the target language. Returns a mock
            translation if GITHUB_TOKEN is not configured. Returns an error
            message prefixed with "[Translation failed]" on exceptions.

    Raises:
        Exception: Logs and catches all exceptions, returning fallback text.
    """
    if not settings.GITHUB_TOKEN:
        logger.warning("No GITHUB_TOKEN — returning mock translation")
        return f"[Mock Translation to {target_language}]: {text}"

    lang_name = _resolve_language(target_language)

    try:
        logger.info("Translating to %s (%s): %s...", lang_name, target_language, text[:80])
        response = await _client.chat.completions.create(
            model=TRANSLATION_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a medical translator. Your ONLY job is to translate text from one language into {lang_name}. "
                        f"Do NOT reply, do NOT answer questions, do NOT explain. "
                        f"Output ONLY the {lang_name} translation of the user's message, nothing else."
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        translated = response.choices[0].message.content or text
        logger.info("Translation result: %s...", translated[:80])
        return translated.strip()
    except Exception as e:
        logger.exception("Translation failed")
        return f"[Translation failed]: {text}"


# ── Summarisation ─────────────────────────────────────────────────────
async def summarize_conversation(messages_text: str) -> str:
    """Generate a clinical summary from a doctor-patient conversation.

    Uses GPT-4o to extract key medical information including chief complaint,
    symptoms discussed, and any recommendations or next steps mentioned.

    Args:
        messages_text (str): The full conversation transcript, typically
            formatted as "Sender: message\n" line by line.

    Returns:
        str: A concise clinical summary suitable for medical documentation.
            Returns a mock summary if GITHUB_TOKEN is not configured. Returns
            "[Summary generation failed]" on exceptions.

    Raises:
        Exception: Logs and catches all exceptions, returning fallback text.
    """
    if not settings.GITHUB_TOKEN:
        return "[Mock Summary] This is a placeholder summary."

    try:
        response = await _client.chat.completions.create(
            model=TRANSLATION_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a medical documentation assistant. "
                        "Summarize the following doctor-patient conversation into a "
                        "concise clinical summary. Include: chief complaint, "
                        "symptoms discussed, any recommendations or next steps."
                    ),
                },
                {"role": "user", "content": messages_text},
            ],
            temperature=0.3,
            max_tokens=1024,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("Summarisation failed")
        return "[Summary generation failed]"


# ── Whisper transcription ─────────────────────────────────────────────
async def transcribe_audio(filepath: str) -> str:
    """Transcribe an audio file to text using Whisper large-v3-turbo.

    Uploads the audio file to the GitHub Models Whisper endpoint and returns
    the recognized speech as text. Supports multiple languages and handles
    various audio formats (webm, wav, mp3, etc.).

    Args:
        filepath (str): Absolute path to the audio file on the local filesystem.

    Returns:
        str: The transcribed text. Returns a mock transcription if GITHUB_TOKEN
            is not configured. Returns "[Audio transcription failed]" on exceptions.

    Raises:
        Exception: Logs and catches all exceptions (file I/O, API errors),
            returning fallback text.
    """
    if not settings.GITHUB_TOKEN:
        return "[Mock transcription of audio]"

    try:
        logger.info("Transcribing audio: %s", filepath)
        with open(filepath, "rb") as audio_file:
            response = await _client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=audio_file,
            )
        transcript = response.text or ""
        logger.info("Transcription result: %s...", transcript[:80])
        return transcript.strip()
    except Exception as e:
        logger.exception("Transcription failed")
        return "[Audio transcription failed]"
