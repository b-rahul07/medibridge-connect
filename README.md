# MediBridge Connect 🏥
### Breaking Language Barriers in Healthcare with Real-Time AI

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

A production-deployed, full-stack platform enabling real-time multilingual medical consultations between doctors and patients. Features live two-way AI translation, cross-language voice transcription, and on-demand clinical note generation — all over an encrypted WebSocket channel.

> 🌐 **Live Demo:** [https://medibridge-connect.vercel.app](https://medibridge-connect.vercel.app)
>
> 🔗 **Backend Health:** [https://medibridge-api-r6ea.onrender.com/health](https://medibridge-api-r6ea.onrender.com/health)
>
> 📂 **GitHub:** [https://github.com/b-rahul07/medibridge-connect](https://github.com/b-rahul07/medibridge-connect)

---

## 🎬 Demo

<video src="https://github.com/b-rahul07/medibridge-connect/raw/main/Medibridge.mp4" controls width="100%"></video>

---

## ✨ Core Features

### 1. Real-Time Multilingual Chat
- **Instant AI Translation** via **GPT-4o** across **11 languages**: English, Spanish, Hindi, French, German, Chinese, Japanese, Arabic, Portuguese, Russian, and Telugu
- **Two-Phase Broadcast** pattern masks the 1–3s LLM latency: the original message appears instantly (Phase 1) while the translation arrives via a Socket.IO `message_updated` event (Phase 2)
- **Optimistic UI** — messages render immediately on send, with translation filling in asynchronously

### 2. Cross-Language Voice Transcription
- Voice notes recorded in the browser are uploaded to **Cloudinary** (persistent CDN storage, solving Render's ephemeral filesystem)
- Transcribed by **OpenAI Whisper (large-v3-turbo)** and then translated — a doctor can *read* a patient's spoken Spanish as English text in real time
- Automatic temp file cleanup post-transcription

### 3. On-Demand AI Clinical Scribe
- At consultation end, **GPT-4o** generates a structured clinical note: **Symptoms → Diagnosis → Treatment Plan**
- Prompt-engineered with medical context and triple-backtick delimiters to prevent refusal on ambiguous phrasing
- Stored in PostgreSQL alongside the full message history

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React 18 + Vite)                    │
│                                                                 │
│   React Router · TanStack Query · socket.io-client · shadcn/ui │
└──────────────────────┬──────────────────────┬───────────────────┘
                       │   HTTPS REST API     │  WSS (Socket.IO)
                       │   /auth /chat        │  message_send
                       │   /consultations     │  message_updated
                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI + python-socketio (ASGI on Render)         │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │  Auth Router │  │  Chat Router  │  │  Consultation Router │ │
│  │  /auth/*     │  │  /chat/*      │  │  /consultations/*    │ │
│  └──────┬───────┘  └──────┬────────┘  └──────────┬───────────┘ │
│         │                 │                       │             │
│  ┌──────▼─────────────────▼───────────────────────▼──────────┐ │
│  │                   Core Services                            │ │
│  │  JWT (httpOnly cookie) · BCrypt · Rate Limiter · CSP/XSS  │ │
│  └──────────────────────────────┬─────────────────────────────┘ │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
┌─────────────────────┐  ┌───────────────┐  ┌────────────────────┐
│     PostgreSQL      │  │    OpenAI     │  │     Cloudinary     │
│  (Render managed)   │  │  GPT-4o       │  │  Audio CDN storage │
│  users · sessions   │  │  Whisper      │  │  (persistent files │
│  messages           │  │  (via GitHub  │  │   across deploys)  │
│  SQLAlchemy pool    │  │   Models API) │  └────────────────────┘
└─────────────────────┘  └───────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|:---|:---|
| **FastAPI over Node.js** | Native async support + Python's OpenAI SDK; background tasks for non-blocking AI calls |
| **REST + Socket.IO hybrid** | REST for transactional reliability (auth, session creation); Socket.IO for sub-100ms real-time updates |
| **Two-Phase Broadcast** | Decouples message delivery from GPT-4o processing, masking 1–3s LLM latency entirely |
| **httpOnly cookies over localStorage** | Eliminates XSS token theft; `SameSite=None; Secure` auto-detected in production |
| **Cloudinary for audio** | Render's ephemeral filesystem loses files on redeploy; Cloudinary provides persistent CDN URLs |

---

## ⚙️ Enterprise Engineering & Security

### 🔐 Authentication & Security Hardening

- **JWT in `httpOnly` cookies** — tokens are inaccessible to JavaScript, eliminating XSS token theft
- **`SameSite=None; Secure`** auto-detected in production (CORS origins contain `https://`); `SameSite=Lax` in dev
- **Custom ASGI middleware** enforces: rate limiting (100 req/min/IP), XSS body scanning, and security headers (`X-Frame-Options: DENY`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`)
- **Encrypted WebSockets** — `getSocket()` in `api.ts` automatically derives `wss://` from `VITE_API_URL` in production:
  ```typescript
  const wsBase = API_BASE
    ? API_BASE.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    : undefined;
  ```

### 🗄️ Database & Scalability

- **SQLAlchemy connection pooling** — tuned for Render's free PostgreSQL tier (~10 max connections):
  ```python
  engine = create_engine(
      DATABASE_URL,
      pool_pre_ping=True,   # Recycle stale connections before use
      pool_size=5,          # Persistent connections in pool
      max_overflow=10,      # Burst capacity under load
      pool_timeout=30,      # Raises OperationalError instead of hanging
      pool_recycle=1800,    # Refresh every 30 min (avoids idle-timeout drops)
  )
  ```
- **Cursor-based pagination** on `/chat/messages?limit=50&cursor={id}` — handles 10,000+ message sessions with sub-20ms query times; prevents browser OOM on long consultations

### 🧪 Automated Testing — 16/16 Passing

A comprehensive `pytest` suite runs against an **isolated SQLite test database** with zero production dependencies:

| Category | Tests | What's Verified |
|:---|:---:|:---|
| **Auth Flow** | 8 | Signup (201), login, `/me`, logout, duplicate email (409), wrong password (401) |
| **Security** | 5 | Rate limiting (100 req/min), XSS body scan (400), SQL injection (422), CORS, security headers |
| **Input Validation** | 3 | Password rules, name sanitization, `httpOnly` cookie presence |

**Infrastructure highlights:**
- `conftest.py` wires `dependency_overrides` to the inner FastAPI `api` instance (not the `socketio.ASGIApp` wrapper — a non-obvious distinction)
- `autouse` fixtures: `clean_users` (per-test DB wipe) and `reset_rate_limit` (clears the in-memory `defaultdict` to prevent test pollution)
- Windows-safe SQLite teardown via `engine.dispose()` before file deletion

```bash
# Run from project root
.venv\Scripts\python.exe -m pytest backend\tests\test_auth_security.py -v --tb=short
# ✅ 16 passed in 3.91s
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|:---|:---|
| **Frontend** | React 18 (TypeScript), Vite, Tailwind CSS, shadcn/ui, TanStack Query, socket.io-client |
| **Backend** | FastAPI (Python 3.13), python-socketio (ASGI), SQLAlchemy 2.x ORM, Uvicorn |
| **Database** | PostgreSQL (Render managed), SQLAlchemy connection pool |
| **AI Services** | GPT-4o (translation, summarization), OpenAI Whisper large-v3-turbo (transcription) |
| **Storage** | Cloudinary (persistent audio CDN) |
| **Security** | python-jose (JWT), passlib/bcrypt, custom ASGI middleware (rate limit, XSS, CSP) |
| **Testing** | pytest, FastAPI TestClient, SQLite (in-memory), autouse fixtures |
| **Deployment** | Vercel (frontend), Render (backend + managed PostgreSQL) |

---

## ⚡ Recent Production-Ready Improvements

| Improvement | Impact |
|:---|:---|
| **16-case automated security test suite** | Catches regressions in auth, XSS, SQL injection, rate limiting before every deploy |
| **SQLAlchemy connection pooling** | Prevents connection exhaustion under concurrent load on Render's free tier |
| **Enforced `wss://` in production** | All real-time traffic encrypted; derived automatically from `VITE_API_URL` |
| **httpOnly JWT cookies** | Eliminates XSS token theft; replaces `localStorage` approach |
| **Cursor-based pagination** | Handles 10,000+ message sessions; prevents browser OOM |
| **Cloudinary audio persistence** | Survives Render redeploys; CDN delivery for low-latency playback |
| **Two-Phase Broadcast** | Masks GPT-4o latency; messages appear instantly, translation follows |
| **Telugu language support** | 11th supported language added to real-time translation pipeline |

---

## ⚙️ Local Setup

**Prerequisites:** Python 3.11+, Node.js 18+, PostgreSQL 14+

### 1. Clone
```bash
git clone https://github.com/b-rahul07/medibridge-connect.git
cd medibridge-connect
```

### 2. Backend
```bash
# Create and activate virtual environment (from project root)
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, JWT_SECRET, GITHUB_TOKEN
# Optional: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

# Apply database schema
psql -U postgres -d medibridge -f backend/schema.sql

# Start backend (from project root)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

### 3. Frontend
```bash
# From project root
npm install
npm run dev
# → http://localhost:5173
```

### 4. Run Tests
```bash
# From project root
.venv\Scripts\python.exe -m pytest backend\tests\test_auth_security.py -v --tb=short
```

---

## ⚠️ Known Limitations & Production Path

| Limitation | Impact | Production Path |
|:---|:---|:---|
| **HIPAA Compliance** | Prototype lacks official audit logging and BAA-certified hosting | Migrate to Azure Health Data Services or AWS HealthLake |
| **Single translation direction** | Sessions limited to one language pair at a time | Fan-out pipeline for multi-party/multi-language sessions |
| **Keyword search only** | PostgreSQL `ILIKE` lacks semantic context | Add `pgvector` for RAG-based clinical semantic search |
| **Single-node Socket.IO** | In-memory event manager; not horizontally scalable | Redis adapter for multi-node state synchronization |

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built for Healthcare Accessibility** · by [Rahul B](https://github.com/b-rahul07)
