# MediBridge Connect

**A real-time, multilingual medical consultation platform that bridges the language gap between doctors and patients.**

Built as a full-stack proof of concept for the Healthcare Translation Challenge. Doctors and patients join a session, chat in their preferred language, and every message is translated in near real-time using GPT-4o. Audio messages are transcribed via Whisper and translated. When the consultation ends, an AI-generated clinical summary is produced automatically.

> **Live Demo:** [https://medibridge-connect.vercel.app](https://medibridge-connect.vercel.app)
>
> **Backend API:** [https://medibridge-api-r6ea.onrender.com/health](https://medibridge-api-r6ea.onrender.com/health)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [AI / LLM Integration](#ai--llm-integration)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [AI Tools & Resources Used](#ai-tools--resources-used)
- [Technical Limitations & Trade-offs](#technical-limitations--trade-offs)
- [License](#license)

---

## Features

| # | Feature | Status | Notes |
|---|---------|:------:|-------|
| 1 | **Real-Time Translation** | ✅ | Two-phase broadcast — message appears instantly, translation follows via Socket.IO `message_updated` event |
| 2 | **Text Chat Interface** | ✅ | Role-distinguished bubbles (indigo for doctor, emerald for patient), timestamps, sender labels with role icons |
| 3 | **Audio Recording & Storage** | ✅ | Browser `MediaRecorder` → server upload → Whisper transcription → translation → real-time broadcast |
| 4 | **Conversation Logging** | ✅ | All text + audio messages persisted in PostgreSQL with UTC timestamps; history loads on session open |
| 5 | **Conversation Search** | ✅ | Server-side `ILIKE` search across all user sessions with keyword highlighting (`<mark>`) and "Go to Session" navigation |
| 6 | **AI-Powered Summary** | ✅ | Doctor clicks "End Consultation" → GPT-4o generates structured clinical notes (symptoms, diagnosis, follow-up) → saved to session |
| 7 | **Role-Based Auth (JWT)** | ✅ | Email/password sign-up with doctor/patient role; JWT tokens with bcrypt password hashing |
| 8 | **Real-Time Session Management** | ✅ | Socket.IO rooms per session; dashboard polling for new requests |
| 9 | **Dark / Light Theme** | ✅ | System-aware toggle via `next-themes` |
| 10 | **10-Language Support** | ✅ | English, Spanish, Hindi, French, German, Chinese, Japanese, Arabic, Portuguese, Russian |
| 11 | **Mobile-Responsive UI** | ✅ | Full responsive design — works on mobile, tablet, and desktop |
| 12 | **Security Hardening** | ✅ | XSS middleware, security headers (X-Frame-Options, CSP, etc.), session authorization checks |
| 13 | **Per-Tab Session Isolation** | ✅ | `sessionStorage` instead of `localStorage` — test Doctor + Patient in two tabs of the same browser |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | Tailwind CSS, shadcn/ui (Radix primitives), Lucide icons |
| **Routing** | React Router v6 |
| **State** | TanStack React Query, custom React hooks |
| **Real-Time** | Socket.IO (client ↔ server) — polling-first with WebSocket upgrade |
| **Backend** | Python FastAPI, SQLAlchemy 2.x ORM, python-socketio (ASGI) |
| **Database** | PostgreSQL |
| **Auth** | JWT (python-jose) + bcrypt (passlib) |
| **AI / LLM** | OpenAI GPT-4o + Whisper large-v3-turbo via GitHub Models (`models.inference.ai.azure.com`) |
| **Testing** | Vitest (frontend unit tests), custom integration test suite (backend — 25 tests) |
| **Deployment** | Vercel (frontend), Render (backend + PostgreSQL) |

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
│          PostgreSQL                  │
│  users · sessions · messages         │
└──────────────────────────────────────┘
```

### Key Data Flow

1. **Patient** creates a consultation → status: `waiting`
2. **Doctor** sees it on the dashboard → clicks **Accept Patient** → status: `active`, both enter the chat room
3. Messages are sent via **REST API** (`POST /chat/{id}/send`) → persisted to PostgreSQL → broadcast instantly via Socket.IO (Phase 1)
4. GPT-4o translates the message in the background → translation saved to DB → pushed as `message_updated` (Phase 2)
5. **Doctor** clicks **End Consultation** → GPT-4o generates a clinical summary → status: `completed`

### Why Two-Phase Broadcast?

Calling GPT-4o adds 1–3 seconds of latency. By splitting into two phases — instant delivery of the original message, followed by a background translation push — the chat feels instantaneous. The UI shows a "Translating…" spinner until Phase 2 arrives.

### Why REST + Socket.IO Hybrid?

Messages are **sent** via REST (reliable, works even if the socket disconnects) and **received** via Socket.IO (real-time push). This ensures messages are never lost during temporary network disruptions. Optimistic rendering provides instant feedback on send.

---

## AI / LLM Integration

All AI processing happens **server-side** to protect API keys and enable richer orchestration.

| Feature | Model | Approach |
|---------|-------|----------|
| **Translation** | GPT-4o | System prompt: *"You are a medical translator. Translate the following text to {language}. Preserve medical terminology."* — Strict instructions to never answer questions, only translate. Language codes mapped to full names (e.g., `hi` → `Hindi`) to avoid GPT-4o misinterpreting short codes. |
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
git clone https://github.com/b-rahul07/medibridge-connect.git
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
cd ..  # back to project root
PYTHONPATH=backend uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# → API at http://localhost:8000 | Health check: http://localhost:8000/health
```

### 3. Use the App

1. Open **http://localhost:8080** in **two browser tabs** (each tab has its own session via `sessionStorage`)
2. **Tab 1:** Sign up as a **Patient** → Click **Request New Consultation**
3. **Tab 2:** Sign up as a **Doctor** → Click **Accept Patient**
4. Both tabs are now in the same chat room — try typing in different languages!

> **Tip:** No incognito needed. Each tab's auth is isolated via `sessionStorage`.

---

## Testing

### Backend Integration Tests (25 tests)

A comprehensive integration test suite covers authentication, consultations, chat, and security:

```bash
# Ensure the backend server is running on localhost:8000, then:
python tests/test_backend.py
```

**Test coverage:**

| Module | Tests | What's Verified |
|--------|:-----:|----------------|
| **A — Auth** | 8 | Signup (doctor/patient), login, bad password (401), `/me`, token isolation |
| **B — Consultations** | 7 | Request, duplicate prevention (409), doctor sees request, accept, session detail, end with summary, patient can't accept (403) |
| **C — Chat** | 6 | Send via REST, doctor reply, retrieve messages, AI translation present, non-participant blocked (403) |
| **E — Security** | 5 | XSS blocked (400), search sessions, detail search, security headers, duplicate email (409) |

### Frontend Unit Tests

```bash
npm test          # Runs Vitest
```

Tests cover utility functions (`cn` merge) and the supported languages configuration.

### Type Checking & Linting

```bash
npx tsc --noEmit  # TypeScript type check (zero errors)
npm run lint      # ESLint
```

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
| `email` | `varchar(255)` | Unique, indexed |
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
| `patient_language` / `doctor_language` | `varchar(10)` | Language codes |
| `summary` | `text` | AI-generated clinical notes |
| `created_at` / `updated_at` | `timestamptz` | Timestamps |

**messages**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | Auto-generated |
| `session_id` | `uuid` | FK → sessions, indexed |
| `sender_id` | `uuid` | FK → users, indexed |
| `content` | `text` | Transcription (for audio) or typed text |
| `translated_content` | `text` | Populated by GPT-4o |
| `audio_url` | `text` | Relative path to uploaded file |
| `created_at` | `timestamptz` | Default `now()` |

---

## Deployment

### Frontend — Vercel

Deployed on Vercel with SPA rewrites configured in `vercel.json`.

**Required Vercel environment variable:**
- `VITE_API_URL` = `https://medibridge-api-r6ea.onrender.com` (your Render backend URL)

### Backend — Render

Deployed on Render using `render.yaml` (Infrastructure as Code).

**Required Render environment variables:**
- `DATABASE_URL` — auto-populated from the Render PostgreSQL service
- `JWT_SECRET` — set manually to a strong random string
- `GITHUB_TOKEN` — set manually to your GitHub PAT
- `CORS_ORIGINS` — set to your Vercel frontend URL (e.g., `https://medibridge-connect.vercel.app`)
- `PYTHON_VERSION` — `3.13.3`

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
| `uvicorn app.main:app --reload` | Start FastAPI dev server with hot reload |
| `python tests/test_backend.py` | Run 25 backend integration tests |

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
│   │   │   └── chat.py          # /chat — message send, history, audio upload
│   │   └── services/
│   │       └── ai_service.py    # GPT-4o translation, summarization, Whisper
│   ├── schema.sql               # Database DDL
│   ├── requirements.txt         # Python dependencies
│   └── .env.example             # Environment template
│
├── src/
│   ├── App.tsx                  # Router + ErrorBoundary + auth guards
│   ├── main.tsx                 # React entry point
│   ├── contexts/
│   │   └── AuthContext.tsx      # Global auth state (JWT-based)
│   ├── hooks/
│   │   ├── useMessages.ts       # Message fetch + Socket.IO real-time + REST send
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
│       ├── ProtectedRoute.tsx   # Auth guard component
│       └── ThemeToggle.tsx      # Dark/Light mode switch
│
├── tests/
│   └── test_backend.py          # 25 backend integration tests
│
├── .env.example                 # Frontend env template
├── render.yaml                  # Render deployment config
├── vercel.json                  # Vercel SPA config
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
| **REST for sending, Socket.IO for receiving** | REST sends are always reliable (no socket dependency). Socket.IO handles real-time push. Messages are never lost during disconnects. |
| **Optimistic rendering** | Messages appear in the chat immediately on send. The server's broadcast replaces the optimistic placeholder, providing instant UX feedback. |
| **Polling-first Socket.IO transport** | WebSocket-first connections sometimes fail during the ASGI handshake. Starting with HTTP long-polling and upgrading to WebSocket after the initial handshake is more reliable. |
| **Server-side AI calls** | Protects the GitHub PAT from browser exposure. Enables richer error handling, retries, and prompt engineering without client updates. |
| **`sessionStorage` for auth tokens** | Isolates authentication per browser tab, allowing Doctor in Tab A and Patient in Tab B without session conflicts. Trade-off: tokens don't survive tab close (acceptable for a demo). |
| **Language codes mapped to names** | GPT-4o interprets `"hi"` as the greeting "hi" rather than Hindi. Mapping `"hi"` → `"Hindi"` in the prompt eliminates this ambiguity. |

---

## AI Tools & Resources Used

This project was developed with the assistance of AI tools:

| Tool | How It Was Used |
|------|----------------|
| **GitHub Copilot (Claude Opus 4.6)** | Code generation, debugging, architecture planning, iterative feature development, and code review throughout the entire project lifecycle |
| **GPT-4o via GitHub Models** | Runtime AI within the app — real-time medical text translation and clinical summary generation |
| **Whisper large-v3-turbo via GitHub Models** | Runtime AI within the app — audio transcription for voice messages |
| **shadcn/ui** | Pre-built accessible UI component library (Radix primitives + Tailwind) |
| **Tailwind CSS** | Utility-first CSS framework for all styling and responsive design |

---

## Technical Limitations & Trade-offs

| # | Limitation | Impact | Production Path |
|---|-----------|--------|----------------|
| 1 | **Local File Storage** | Audio files stored in a local `/uploads` directory. Ephemeral filesystems on Render are wiped on restart. | Migration to **AWS S3** or **Google Cloud Storage** with signed URLs. |
| 2 | **Keyword vs. Semantic Search** | Current search uses PostgreSQL `ILIKE` (keyword matching). Searching for "heart pain" won't find "cardiac arrest". | Implementation of **pgvector** for RAG-based semantic search. |
| 3 | **Stateless WebSockets** | Socket.IO uses an in-memory manager. Multi-instance scaling would break room routing. | Integration of a **Redis adapter** for Socket.IO. |
| 4 | **HIPAA Compliance** | Data encrypted in transit (TLS) and at rest, but not fully HIPAA compliant. Lacks audit logging and BAA-certified hosting. | Audit logging, BAA-certified hosting (e.g., Azure Health), field-level encryption. |
| 5 | **Single Target Language** | Each message translated to one language only. | Fan-out translation pipeline for multi-party sessions. |
| 6 | **No Streaming Translation** | Translation arrives as a single update after 1–3s. | Use OpenAI streaming API to show translation token-by-token. |
| 7 | **No Message Pagination** | All messages loaded at once. | Cursor-based pagination for long conversations. |
| 8 | **No Email Verification** | Sign-up is immediate for demo convenience. | Email confirmation flow with token-based verification. |
| 9 | **No Rate Limiting** | AI endpoints are unprotected against abuse. | Add FastAPI rate-limiting middleware (e.g., `slowapi`). |
| 10 | **JWT in `sessionStorage`** | Per-tab isolation (trade-off: doesn't survive tab close). XSS mitigated by security headers & middleware. | `httpOnly` cookies with CSRF protection for production. |

---

## License

MIT
