# MediBridge Connect

**A real-time, multilingual medical consultation platform that bridges the language gap between doctors and patients.**

Built as a full-stack proof of concept for the Healthcare Translation Challenge. Doctors and patients join a session, chat in their preferred language, and every message is translated in near real-time using GPT-4o. Audio messages are transcribed via Whisper and translated. When the consultation ends, an AI-generated clinical summary is produced automatically.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [AI / LLM Integration](#ai--llm-integration)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [License](#license)

---

## Features

| # | Feature | Status | Notes |
|---|---------|:------:|-------|
| 1 | **Real-Time Translation** | ✅ | Two-phase broadcast — message appears instantly, translation follows via Socket.IO `message_updated` event |
| 2 | **Text Chat Interface** | ✅ | Role-distinguished bubbles (color + alignment), timestamps, "Translating…" spinner |
| 3 | **Audio Recording & Storage** | ✅ | Browser `MediaRecorder` → server upload → Whisper transcription → translation → real-time broadcast |
| 4 | **Conversation Logging** | ✅ | All text + audio messages persisted in PostgreSQL with UTC timestamps; history loads on session open |
| 5 | **Conversation Search** | ✅ | Server-side `ILIKE` search across all user sessions with keyword highlighting and "Go to Session" navigation |
| 6 | **AI-Powered Summary** | ✅ | Doctor clicks "End Consultation" → GPT-4o generates structured clinical notes → saved to session |
| 7 | Role-Based Auth (JWT) | ✅ | Email/password sign-up with doctor/patient role; JWT tokens with bcrypt password hashing |
| 8 | Real-Time Session Management | ✅ | Socket.IO rooms per session; session polling for dashboard updates |
| 9 | Dark / Light Theme | ✅ | System-aware toggle via `next-themes` |
| 10 | 10-Language Support | ✅ | English, Spanish, Hindi, French, German, Chinese, Japanese, Arabic, Portuguese, Russian |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | Tailwind CSS, shadcn/ui (Radix primitives), Lucide icons |
| **Routing** | React Router v6 |
| **State** | TanStack React Query, custom hooks |
| **Real-Time** | Socket.IO (client ↔ server) — polling-first with WebSocket upgrade |
| **Backend** | Python FastAPI, SQLAlchemy 2.x ORM, python-socketio (ASGI) |
| **Database** | PostgreSQL 18 |
| **Auth** | JWT (python-jose) + bcrypt (passlib) |
| **AI / LLM** | OpenAI GPT-4o + Whisper via GitHub Models (`models.inference.ai.azure.com`) |
| **Testing** | Vitest, React Testing Library |

---

## Architecture

```
┌──────────────────────────────────────┐
│          Browser (React SPA)         │
│  React Router · TanStack Query       │
│  socket.io-client · Tailwind         │
└──────────┬───────────────┬───────────┘
           │   REST API    │  Socket.IO
           ▼               ▼
┌──────────────────────────────────────┐
│        FastAPI + python-socketio     │
│  /auth    /consultations    /chat    │
│  /ai/translate    /ai/summarize      │
│                                      │
│  ┌────────────┐  ┌────────────────┐  │
│  │ JWT Auth   │  │ AI Service     │  │
│  │ bcrypt     │  │ GPT-4o         │  │
│  │            │  │ Whisper        │  │
│  └────────────┘  └────────────────┘  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│          PostgreSQL 18               │
│  users · sessions · messages         │
└──────────────────────────────────────┘
```

### Key Data Flow

1. **Patient** creates a consultation → status: `waiting`
2. **Doctor** sees it on the dashboard → clicks **Accept Patient** → status: `active`, both in the chat room
3. Messages are sent via **Socket.IO** → persisted to PostgreSQL → broadcast instantly (Phase 1)
4. GPT-4o translates the message in the background → translation saved to DB → pushed as `message_updated` (Phase 2)
5. **Doctor** clicks **End Consultation** → GPT-4o generates a clinical summary → status: `completed`

### Why Two-Phase Broadcast?

Calling GPT-4o adds 1–3 seconds of latency. By splitting into two phases — instant delivery of the original message, followed by a background translation push — the chat feels instantaneous. The UI shows a "Translating…" spinner until Phase 2 arrives.

---

## AI / LLM Integration

All AI processing happens **server-side** to protect API keys and enable richer orchestration.

| Feature | Model | Approach |
|---------|-------|----------|
| **Translation** | GPT-4o | System prompt: *"You are a medical translator. Translate the following text to {language}. Preserve medical terminology."* — Strict instructions to never answer questions, only translate. Language codes mapped to full names (e.g., `hi` → `Hindi`) to avoid ambiguity. |
| **Summarization** | GPT-4o | Formats full conversation as `Doctor: …` / `Patient: …` pairs. System prompt instructs structured clinical notes with chief complaint, symptoms, diagnosis, plan, and follow-up. |
| **Audio Transcription** | Whisper (large-v3-turbo) | `.webm` audio uploaded to server → sent to Whisper for transcription → transcript then translated with the same GPT-4o pipeline. |

**Graceful degradation:** If `GITHUB_TOKEN` is empty, the AI service returns mock translations/summaries so the app remains functional for UI testing.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm** (or bun)
- **Python** 3.11+ and **pip**
- **PostgreSQL** 14+ running locally
- A **GitHub Personal Access Token** with GitHub Models access ([github.com/settings/tokens](https://github.com/settings/tokens))

### 1. Frontend Setup

```bash
# Clone the repository
git clone https://github.com/<your-username>/medibridge-connect.git
cd medibridge-connect

# Install frontend dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# Start the frontend dev server
npm run dev
# → Opens at http://localhost:8080
```

### 2. Backend Setup

```bash
# Navigate to the backend directory
cd backend

# Create a Python virtual environment
python -m venv ../.venv
# Activate it:
#   Windows: ..\.venv\Scripts\Activate.ps1
#   macOS/Linux: source ../.venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
# Edit .env — fill in DATABASE_URL, GITHUB_TOKEN, JWT_SECRET

# Run the database schema
psql -U postgres -d medibridge -f schema.sql

# Start the backend server
uvicorn app.main:combined_app --reload --host 0.0.0.0 --port 8000
# → API available at http://localhost:8000
# → Health check: http://localhost:8000/health
```

### 3. Use the App

1. Open **http://localhost:8080** in two browser tabs (or one regular + one incognito)
2. **Tab 1:** Sign up as a **Patient** → Click **Request New Consultation**
3. **Tab 2:** Sign up as a **Doctor** → Click **Accept Patient**
4. Both tabs are now in the same chat room — try typing in different languages!

---

## Environment Variables

### Frontend (`.env` in project root)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (e.g., `postgresql://postgres:pass@localhost:5432/medibridge`) |
| `JWT_SECRET` | ✅ | Random string for signing JWT tokens |
| `GITHUB_TOKEN` | ✅ | GitHub PAT with Models access for GPT-4o / Whisper |
| `AI_ENDPOINT` | — | Defaults to `https://models.inference.ai.azure.com` |
| `CORS_ORIGINS` | — | Comma-separated allowed origins (defaults to `http://localhost:5173,http://localhost:8080`) |
| `HOST` | — | Server bind address (default `0.0.0.0`) |
| `PORT` | — | Server port (default `8000`) |

> **Security:** Never commit `.env` files. Both `.env.example` templates are provided.

---

## Database Setup

The app expects a PostgreSQL database named `medibridge`. Run `backend/schema.sql` to create all tables:

### Tables

**users**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `email` | `varchar(255)` | Unique |
| `password_hash` | `text` | bcrypt hash |
| `full_name` | `text` | |
| `role` | `varchar(20)` | `'doctor'` or `'patient'` |
| `created_at` | `timestamptz` | Default `now()` |

**sessions**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `patient_id` | `uuid` | FK → users |
| `doctor_id` | `uuid` | Nullable, FK → users |
| `status` | `varchar(20)` | `'waiting'`, `'active'`, or `'completed'` |
| `patient_language` / `doctor_language` | `varchar(10)` | Nullable, language codes |
| `summary` | `text` | Nullable, AI-generated |
| `created_at` / `updated_at` | `timestamptz` | Timestamps |

**messages**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `session_id` | `uuid` | FK → sessions |
| `sender_id` | `uuid` | FK → users |
| `content` | `text` | Transcription (for audio) or typed text |
| `translated_content` | `text` | Nullable — populated by GPT-4o |
| `audio_url` | `text` | Nullable — relative path to uploaded file |
| `created_at` | `timestamptz` | Default `now()` |

---

## Available Scripts

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 8080) |
| `npm run build` | Production build (TypeScript check + bundle) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |

### Backend

| Command | Description |
|---------|-------------|
| `uvicorn app.main:combined_app --reload` | Start FastAPI dev server with hot reload |
| `python -m pytest` | Run backend tests (if added) |

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + Socket.IO ASGI mount
│   │   ├── config.py            # Environment variable configuration
│   │   ├── database.py          # SQLAlchemy engine & session factory
│   │   ├── models.py            # ORM models (User, Session, Message)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── auth.py              # JWT creation, verification, password hashing
│   │   ├── sockets.py           # Socket.IO event handlers (two-phase broadcast)
│   │   ├── routes/
│   │   │   ├── auth.py          # /auth — signup, login, me
│   │   │   ├── consultations.py # /consultations — CRUD, search
│   │   │   └── chat.py          # /chat — message history, audio upload
│   │   └── services/
│   │       └── ai_service.py    # GPT-4o translation, summarization, Whisper transcription
│   ├── schema.sql               # Database DDL
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Environment template
│   └── uploads/                 # Audio file storage (gitignored)
│
├── src/
│   ├── App.tsx                  # Router + auth guards
│   ├── main.tsx                 # React entry point
│   ├── contexts/
│   │   └── AuthContext.tsx       # Global auth state (JWT-based)
│   ├── hooks/
│   │   ├── useMessages.ts       # Message fetch + Socket.IO real-time
│   │   ├── useSessions.ts       # Session CRUD + periodic refresh
│   │   ├── useConversationSearch.ts  # Server-side keyword search
│   │   └── useAudioRecorder.ts  # Browser MediaRecorder wrapper
│   ├── lib/
│   │   ├── api.ts               # REST client + Socket.IO singleton
│   │   ├── translator.ts        # Language list + translate helper
│   │   └── utils.ts             # Tailwind cn() merge utility
│   ├── pages/
│   │   ├── LandingPage.tsx      # Public hero page
│   │   ├── Login.tsx            # Auth page with role selector
│   │   ├── DoctorDashboard.tsx  # Dashboard (sessions, search, summaries)
│   │   ├── SessionChat.tsx      # Real-time chat with translation + voice
│   │   └── NotFound.tsx         # 404 page
│   └── components/
│       ├── ui/                  # shadcn/ui primitives
│       └── ThemeToggle.tsx      # Dark/Light mode switch
│
├── .env.example                 # Frontend env template
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **FastAPI + python-socketio** over Node.js | Python ecosystem has superior AI/ML library support. Socket.IO provides reliable real-time with automatic fallback from WebSocket to long-polling. |
| **Two-phase broadcast** | GPT-4o adds 1–3s latency. Splitting into instant delivery + background translation makes the chat feel responsive. |
| **Polling-first Socket.IO transport** | WebSocket-first connections sometimes fail during the ASGI handshake. Starting with HTTP long-polling and upgrading to WebSocket after the initial handshake is more reliable. |
| **Server-side AI calls** | Protects the GitHub PAT from browser exposure. Enables richer error handling, retries, and prompt engineering without client updates. |
| **JWT in localStorage** | Simplest auth approach for an SPA. Trade-off: vulnerable to XSS (acceptable for a prototype; production would use httpOnly cookies). |
| **Language codes mapped to names** | GPT-4o interpretes `"hi"` as the greeting "hi" rather than Hindi. Mapping `"hi"` → `"Hindi"` in the prompt eliminates this ambiguity. |
| **Client-side language selection** | Each user picks their own language and their target language. The sender's target language determines translation direction — this is the simplest mental model for users. |

---

## Known Limitations & Future Work

| Limitation | Detail | Future Improvement |
|-----------|--------|-------------------|
| **Single target language** | Each message is translated to one language. | Fan-out translation pipeline for multi-party sessions. |
| **Keyword search only** | `ILIKE` matching. | PostgreSQL full-text search (`tsvector`) or vector/semantic search. |
| **No streaming translation** | Translation arrives as a single update. | Use OpenAI streaming API to show translation token-by-token. |
| **No message pagination** | All messages loaded at once. | Cursor-based pagination for long conversations. |
| **No email verification** | Sign-up is immediate for demo convenience. | Email confirmation flow. |
| **No rate limiting** | AI endpoints are unprotected. | Add FastAPI rate limiting middleware. |

---

## License

MIT
