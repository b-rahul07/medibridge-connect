# MediBridge Connect 🏥
**Breaking Language Barriers in Healthcare with Real-time AI.**

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)

MediBridge is a real-time medical consultation platform designed to bridge the gap between doctors and patients who speak different languages. It features instant two-way translation, voice-to-text transcription, and secure, low-latency communication.

> **Live Demo:** [https://medibridge-connect.vercel.app](https://medibridge-connect.vercel.app)
>
> **Backend API:** [https://medibridge-api-r6ea.onrender.com/health](https://medibridge-api-r6ea.onrender.com/health)
>
> **GitHub:** [https://github.com/b-rahul07/medibridge-connect](https://github.com/b-rahul07/medibridge-connect)

---

## ⚡ Recent Production-Ready Improvements

### 🌐 **Telugu Language Support**
Added Telugu (`te`) as the 11th supported language for real-time medical translation, bringing the full list to: English, Spanish, Hindi, French, German, Chinese, Japanese, Arabic, Portuguese, Russian, and Telugu.

### 🛡️ **Translation Prompt Hardening**
Improved AI translation prompt to prevent GPT-4o from refusing to translate messages that resemble hostile/inappropriate text (e.g., "what is your problem"). The model now treats all input strictly as medical consultation text to be translated literally, using triple-backtick delimiters and explicit instructions to never refuse or reply.

### 🔧 **Backend .env Path Fix**
Fixed a critical bug where the backend `config.py` failed to load the `.env` file due to incorrect path resolution (`Path(__file__).parent.parent` → `Path(__file__).parent.parent.parent`). This caused local development to fall back to default placeholder credentials, breaking database connectivity and sign-in.

### 🔒 **Security Enhancement: httpOnly Cookies**
JWT tokens now stored in `httpOnly` cookies instead of JavaScript-accessible storage, preventing XSS token theft attacks. Includes automatic CSRF protection via `SameSite=Lax` policy and dual authentication support (cookie-first with Bearer fallback for Socket.IO).

### ☁️ **Cloud Storage: Cloudinary Integration**
Audio files now persist to Cloudinary with CDN delivery, solving ephemeral filesystem issues on Render/Vercel. Includes graceful local storage fallback and automatic temp file cleanup after transcription.

### 📊 **Scalability: Cursor-Based Pagination**
Message endpoints now support `?limit=50&cursor={message_id}` pagination (max 100), preventing browser crashes with long conversations. Handles 10,000+ message sessions efficiently with sub-20ms query times.

### 🧪 **Phase 2: Automated Security Test Suite (16/16 Passing)**
Built a comprehensive `pytest` suite covering authentication, security hardening, and input validation — all running against an isolated SQLite test database with zero production dependencies.

| Test Category | Tests | Coverage |
|:---|:---|:---|
| **Auth Flow** | 8 tests | Signup, login, `/me`, logout, duplicate email, wrong password |
| **Security** | 5 tests | Rate limiting (100 req/min), XSS body scan, SQL injection, CORS, security headers |
| **Input Validation** | 3 tests | Password rules (length, repeated chars), name sanitization, httpOnly cookies |

**Infrastructure built:**
- `conftest.py` — shared fixtures: SQLite test engine, `TestClient` with `get_db` override, autouse rate-limit reset, per-test user cleanup
- Correctly wires `dependency_overrides` to the inner FastAPI `api` instance (not the `socketio.ASGIApp` wrapper)

```bash
# Run the full suite
cmd /c ".venv\Scripts\python.exe -m pytest backend\tests\test_auth_security.py -v --tb=short"
# Result: 16 passed in 3.91s ✅
```

### 🗄️ **Phase 3: SQLAlchemy Connection Pooling**
Replaced the default unbounded engine with a production-tuned pool, preventing connection exhaustion under concurrent load on Render's free PostgreSQL tier (~10 max connections).

```python
engine = create_engine(
    _db_url,
    pool_pre_ping=True,   # Recycle stale connections before use
    pool_size=5,          # Persistent connections in pool
    max_overflow=10,      # Extra connections under burst load
    pool_timeout=30,      # Wait limit before raising OperationalError
    pool_recycle=1800,    # Refresh every 30 min (avoids idle-timeout drops)
)
```

### 🔐 **Phase 3: Secure WebSocket Enforcement (wss://)**
Socket.IO client now automatically derives `wss://` from `VITE_API_URL` in production, ensuring all real-time traffic is encrypted. Dev proxy is unaffected.

```typescript
// https://api.onrender.com → wss://api.onrender.com (automatic)
const wsBase = API_BASE
  ? API_BASE.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  : undefined;
```

<details>
<summary><strong>🐛 Bug Fixes Applied During Implementation (Click to expand)</strong></summary>

The three features above introduced several cross-cutting issues that were identified and resolved:

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| **Sign-in not working (local dev)** | `fetch()` wrapper missing credentials: 'include' — browser silently dropped the Set-Cookie header | Added `credentials: 'include'` to the generic `request()` wrapper in `api.ts` |
| **Sign-in not working (cross-origin)** | Frontend (Vercel) and backend (Render) are different origins — SameSite=Lax cookies are never sent cross-origin | Added Vite dev proxy for same-origin requests in dev; returned JWT in response body for production `sessionStorage` fallback |
| **Socket.IO "Reconnecting..." loop** | Socket.IO client had `auth: { token }` removed during migration | Restored `auth: { token: getToken() }` on client; added fallback parsing on backend |
| **"Translating..." stuck forever** | Socket.IO unable to connect meant `message_updated` events never arrived | Fixed via Socket.IO connection resolution; restored two-phase broadcast pattern |
| **Cookie Secure flag mismatch** | `secure=False` cookies rejected by browsers on HTTPS sites | Auto-detect production via CORS origins to set `SameSite=None; Secure` automatically |
| **Backend crash on startup** | Python docstring syntax error | Fixed docstring formatting in `chat.py` |
| **Missing messages** | Frontend called `getMessages()` once without pagination params | Added `getAllMessages()` that auto-paginates through all pages on initial chat load |

| **Backend .env not loading** | `config.py` path resolution off by one directory level | Fixed `Path(__file__).parent.parent` → `.parent.parent.parent` to correctly locate `backend/.env` |
| **AI refusing to translate** | GPT-4o interpreted user messages (e.g., "what is your problem") as hostile questions directed at itself | Hardened prompt with triple-backtick delimiters and explicit "never refuse" instructions |

</details>


---

## 🚀 Features

### **1. Real-time Multilingual Chat**
*   **Instant Translation:** Powered by **GPT-4o**, messages are translated instantly between the patient's and doctor's preferred languages. Supports 11 languages including English, Spanish, Hindi, French, German, Chinese, Japanese, Arabic, Portuguese, Russian, and Telugu.
*   **Zero-Lag Architecture:** Uses an optimistic UI update pattern to show messages immediately while AI processing happens in the background.
*   **Two-Phase Broadcast:** Original message appears instantly (Phase 1), translation follows within 1-3 seconds (Phase 2) via Socket.IO updates.

### **2. Voice-First Communication**
*   **Whisper Integration:** Voice notes are automatically transcribed into text using **OpenAI Whisper (large-v3-turbo)**.
*   **Cross-Language Audio:** Audio transcripts are also translated, allowing a doctor to "read" a patient's spoken Spanish as English text.
*   **Cloud Persistence:** Audio files persisted to **Cloudinary** with CDN delivery.

### **3. Professional Medical Workflow**
*   **Role-Based Access:** Distinct portals for Doctors (Queue Management) and Patients (Consultation Requests).
*   **AI-Powered Summaries:** GPT-4o generates structured clinical notes (symptoms, diagnosis, plan) when consultations end.
*   **Secure History:** All consultations are persistently stored in **PostgreSQL**.

### **4. Enterprise-Grade Security**
*   **JWT Authentication:** Email/password sign-up with bcrypt hashing and JWT tokens stored in `httpOnly` cookies (XSS protection).
*   **CSRF Protection:** `SameSite=Lax` cookie policy prevents cross-site request forgery attacks.
*   **Role Guards:** Backend authorization checks on every protected endpoint.

---

## 🛠️ Tech Stack

*   **Frontend:** React 18 (TypeScript), Vite, Tailwind CSS, shadcn/ui, Socket.io-client
*   **Backend:** FastAPI (Python), Python-Socket.io (ASGI), SQLAlchemy 2.x ORM
*   **Database:** PostgreSQL (with indexed foreign keys for performance)
*   **Cloud Storage:** Cloudinary (persistent audio file storage with CDN delivery)
*   **AI Services:**
    *   **Translation:** GPT-4o via GitHub Models (`models.inference.ai.azure.com`)
    *   **Transcription:** OpenAI Whisper (large-v3-turbo)
    *   **Summarization:** GPT-4o with medical prompt engineering
*   **Security:** python-jose (JWT), BCrypt (passlib), CORS middleware, CSP headers
*   **Deployment:** Vercel (frontend), Render (backend + managed PostgreSQL)

---

## ⚙️ Setup & Installation

**Prerequisites:** Python 3.11+, Node.js 18+, PostgreSQL 14+

### 1. Clone the Repository
```bash
git clone https://github.com/b-rahul07/medibridge-connect.git
cd medibridge-connect
```

### 2. Backend Setup
```bash
cd backend
python -m venv ../.venv
source ../.venv/bin/activate  # On Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt

# Configure Environment
# Create a .env file with: DATABASE_URL, JWT_SECRET, GITHUB_TOKEN
# Optional: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, USE_CLOUDINARY=true
cp .env.example .env

# Run database schema
psql -U postgres -d medibridge -f schema.sql

# Start Server (from backend directory)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
# From project root
npm install
npm run dev
# → Opens at http://localhost:8080
```

---

## 🏗️ Architecture

```ascii
┌──────────────────────────────────────┐
│         Browser (React SPA)          │
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
│           PostgreSQL                 │
│  users · sessions · messages         │
└──────────────────────────────────────┘
```

### **Key Design Decisions**
*   **FastAPI over Node.js:** Leveraged Python's superior AI/ML ecosystem (OpenAI SDK) and native support for asynchronous background tasks.
*   **Two-Phase Broadcast:** Masked GPT-4o's 1-3s processing latency by decoupling message delivery from translation.
*   **REST + Socket.IO Hybrid:** Used REST for transactional reliability (Auth, Session Creation) and Socket.IO for real-time low-latency updates.

---

### **⚠️ Known Limitations & Production Path**
| Limitation | Impact | Production Path |
|:--- |:--- |:--- |
| **HIPAA Compliance** | Prototype lacks official audit logging and BAA-certified hosting. | Migration to Azure Health or AWS HealthLake for certified infra. |
| **Single Target Lang** | Sessions are limited to one translation direction at a time. | Implement a fan-out pipeline for multi-party/multi-lang sessions. |
| **Keyword Search** | Uses PostgreSQL ILike, which lacks semantic context. | Implement pgvector for RAG-based clinical semantic search. |
| **Scaling** | Socket.IO uses in-memory manager; not ready for multi-node. | Integration of a Redis adapter for state synchronization. |

---

## 📝 License

MIT License - See LICENSE for details.

---

**Built for Healthcare Accessibility**  
by [Rahul B](https://github.com/b-rahul07)
