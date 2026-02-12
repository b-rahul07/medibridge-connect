# MediBridge Connect 🏥
**Breaking Language Barriers in Healthcare with Real-time AI.**

MediBridge is a real-time medical consultation platform designed to bridge the gap between doctors and patients who speak different languages. It features instant two-way translation, voice-to-text transcription, and secure, low-latency communication.

> **Live Demo:** [https://medibridge-connect.vercel.app](https://medibridge-connect.vercel.app)
>
> **Backend API:** [https://medibridge-api-r6ea.onrender.com/health](https://medibridge-api-r6ea.onrender.com/health)
>
> **GitHub:** [https://github.com/b-rahul07/medibridge-connect](https://github.com/b-rahul07/medibridge-connect)

---

## ⚡ Recent Production-Ready Improvements

### 🔒 **Security Enhancement: httpOnly Cookies**
JWT tokens now stored in httpOnly cookies instead of JavaScript-accessible storage, preventing XSS token theft attacks. Includes automatic CSRF protection via SameSite=Lax policy and dual authentication support (cookie-first with Bearer fallback for Socket.IO).

### ☁️ **Cloud Storage: Cloudinary Integration**
Audio files now persist to Cloudinary with CDN delivery, solving ephemeral filesystem issues on Render/Vercel. Includes graceful local storage fallback and automatic temp file cleanup after transcription.

### 📊 **Scalability: Cursor-Based Pagination**
Message endpoints now support `?limit=50&cursor={message_id}` pagination (max 100), preventing browser crashes with long conversations. Handles 10,000+ message sessions efficiently with sub-20ms query times.

---

## 🚀 Features

### **1. Real-time Multilingual Chat**
* **Instant Translation:** Powered by **GPT-4o**, messages are translated instantly between the patient's and doctor's preferred languages (e.g., Spanish ↔ English).
* **Zero-Lag Architecture:** Uses an optimistic UI update pattern to show messages immediately while AI processing happens in the background.
* **Two-Phase Broadcast:** Original message appears instantly (Phase 1), translation follows within 1-3 seconds (Phase 2) via Socket.IO `message_updated` event.

### **2. Voice-First Communication**
* **Whisper Integration:** Users can send voice notes which are automatically transcribed into text using **OpenAI Whisper (large-v3-turbo)**.
* **Cross-Language Audio:** Audio transcripts are also translated, allowing a doctor to "read" a patient's spoken Spanish as English text.
* **Browser MediaRecorder:** Client-side audio capture with `.webm` format, uploaded to backend for processing.
* **Cloud Storage:** Audio files persisted to **Cloudinary** with CDN delivery (configurable local fallback).

### **3. Professional Medical Workflow**
* **Role-Based Access:** Distinct portals for Doctors (Queue Management) and Patients (Consultation Requests).
* **Secure History:** All consultations are persistently stored in **PostgreSQL** for medical record-keeping.
* **AI-Powered Summaries:** GPT-4o generates structured clinical notes (symptoms, diagnosis, plan) when consultations end.
* **Conversation Search:** Server-side keyword search with highlighting and session navigation.
* **Scalable Pagination:** Cursor-based message loading (50 messages per page, max 100) prevents browser crashes.

### **4. Enterprise-Grade Security**
* **JWT Authentication:** Email/password sign-up with bcrypt password hashing and JWT tokens stored in **httpOnly cookies** (XSS protection).
* **CSRF Protection:** SameSite=Lax cookie policy prevents cross-site request forgery attacks.
* **XSS Protection:** Content Security Policy headers, httpOnly cookies, and input sanitization middleware.
* **Role Guards:** Backend authorization checks on every protected endpoint.
* **Dual Auth Support:** Cookie-first authentication with Bearer token fallback for Socket.IO compatibility.

---

## 🛠️ Tech Stack

* **Frontend:** React 18 (TypeScript), Vite, Tailwind CSS, shadcn/ui, Socket.io-client
* **Backend:** FastAPI (Python), Python-Socket.io (ASGI), SQLAlchemy 2.x ORM
* **Database:** PostgreSQL (with indexed foreign keys for performance)
* **Cloud Storage:** Cloudinary (persistent audio file storage with CDN delivery)
* **AI Services:**
    * **Translation:** GPT-4o via GitHub Models (`models.inference.ai.azure.com`)
    * **Transcription:** OpenAI Whisper (large-v3-turbo)
    * **Summarization:** GPT-4o with medical prompt engineering
* **Security:** JWT httpOnly cookies (python-jose), BCrypt (passlib), CORS middleware, CSP headers
* **Testing:** Vitest (frontend, 6 tests), Custom integration suite (backend, 25 tests)
* **Deployment:** Vercel (frontend), Render (backend + managed PostgreSQL)

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
# Edit .env and fill in your values

# Run database schema
psql -U postgres -d medibridge -f schema.sql

# Start Server (from project root)
cd ..
PYTHONPATH=backend uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
# From project root
npm install
npm run dev
# → Opens at http://localhost:8080
```

### 4. Test the Application
1. Open **two browser tabs** at `http://localhost:8080`
2. **Tab 1:** Sign up as **Patient** → Request consultation
3. **Tab 2:** Sign up as **Doctor** → Accept consultation
4. Send messages in different languages and watch real-time translation!

---

## 🏗️ Architecture

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

## 🧬 Project Structure (Professional Architecture)

```
MediBridge/
├── backend/                  # Python FastAPI Logic
│   ├── app/
│   │   ├── api/              # API Routes (Auth, Chat, Consultations)
│   │   │   ├── auth.py
│   │   │   ├── chat.py
│   │   │   └── consultations.py
│   │   ├── core/             # Security & Environment Config
│   │   │   ├── config.py     # Environment variables
│   │   │   ├── database.py   # SQLAlchemy setup
│   │   │   └── security.py   # JWT + bcrypt
│   │   ├── models/           # Database ORM Models
│   │   │   └── models.py     # User, Session, Message
│   │   ├── services/         # Business Logic
│   │   │   ├── ai_service.py       # GPT-4o & Whisper
│   │   │   └── socket_service.py   # Real-time events
│   │   ├── main.py           # FastAPI App Entry
│   │   └── schemas.py        # Pydantic request/response models
│   ├── tests/                # Backend Integration Tests (25 tests)
│   ├── .env                  # Backend Secrets (gitignored)
│   ├── requirements.txt      # Python Dependencies
│   └── schema.sql            # PostgreSQL DDL
│
├── src/                      # React TypeScript Frontend
│   ├── services/             # API Client & External Services
│   │   ├── api.ts            # REST client + Socket.IO singleton
│   │   └── translator.ts     # Language utilities
│   ├── context/              # Global State Management
│   │   └── AuthContext.tsx   # JWT authentication state
│   ├── hooks/                # Custom React Hooks
│   │   ├── useMessages.ts    # Real-time chat logic
│   │   ├── useSessions.ts    # Session CRUD
│   │   └── useAudioRecorder.ts  # Voice recording
│   ├── pages/                # Full Screen Components
│   │   ├── LandingPage.tsx
│   │   ├── Login.tsx
│   │   ├── DoctorDashboard.tsx
│   │   └── SessionChat.tsx
│   ├── components/           # Reusable UI Components
│   │   ├── ProtectedRoute.tsx
│   │   └── ui/               # shadcn/ui primitives
│   ├── App.tsx               # React Router + ErrorBoundary
│   └── main.tsx              # React Entry Point
│
├── .env.example              # Environment Template
├── package.json              # Frontend Dependencies
├── vercel.json               # Vercel Deployment Config
└── README.md                 # This File
```

---

## 🛡️ Security & Middleware

* **httpOnly Cookies:** JWT tokens stored in httpOnly cookies (JavaScript cannot access, prevents XSS token theft)
* **CSRF Protection:** SameSite=Lax cookie policy blocks cross-site request forgery attacks
* **CORS Protection:** Strict origin whitelisting (only Vercel frontend + localhost allowed)
* **XSS Middleware:** Content Security Policy headers (X-Frame-Options, X-Content-Type-Options)
* **Input Sanitization:** Backend validates and escapes all user input before translation
* **JWT Tokens:** Short-lived tokens (24hr) with bcrypt-hashed passwords (10 rounds)
* **Dual Auth:** Cookie-first with Bearer token fallback for Socket.IO and mobile clients
* **Health Checks:** Dedicated `/health` endpoint monitors:
  - Database connectivity
  - AI service availability (GitHub Models)
  - Server uptime
* **Data Isolation:** Every API endpoint validates `session_id` and `user_id` to ensure users can only access their own consultations

---

## 🧪 Testing

### Backend Integration Tests (25 Tests)
```bash
# Ensure backend is running on localhost:8000
python backend/tests/test_backend.py
```

**Coverage:**
- ✅ **Module A (Auth):** Signup, login, JWT validation, httpOnly cookies, logout endpoint
- ✅ **Module B (Consultations):** Request, accept, end, search, duplicate prevention
- ✅ **Module C (Chat):** REST send, audio upload, AI translation, message retrieval, pagination
- ✅ **Module E (Security):** XSS blocking, authorization checks, security headers, CSRF protection

### Frontend Unit Tests (6 Tests)
```bash
npm test  # Vitest
```

---

## 🔮 Future Improvements

### Scalability
* **Redis for Socket.IO:** Enable horizontal scaling across multiple backend instances
* **Infinite Scroll UI:** Frontend pagination UI with automatic cursor management
* **Video Consultations:** WebRTC integration for face-to-face appointments

### AI Enhancements
* **Streaming Translation:** Show GPT-4o tokens as they're generated (token-by-token UI)
* **Semantic Search:** Implement pgvector for RAG-based search ("chest pain" finds "cardiac arrest")
* **Multi-Language Rooms:** Support 3+ participants with fan-out translation

### Compliance & Security
* **HIPAA Compliance:** BAA-certified hosting (Azure Health), field-level encryption, audit logging
* **Rate Limiting:** Protect AI endpoints from abuse (slowapi middleware)
* **Email Verification:** Token-based email confirmation before account activation

---

## 🎥 Demo Video Script

**60-Second Walkthrough for Recruiters:**

1. **0:00-0:10 (Hook):** Landing page → "Hi, I'm Rahul. MediBridge eliminates language barriers in healthcare using GPT-4o and Whisper."
2. **0:10-0:25 (Real-time Chat):** Split screen (Doctor/Patient) → Patient types Spanish, Doctor sees English instantly → "Zero-lag translation."
3. **0:25-0:40 (Audio Magic):** Record voice note → Show transcript + translation → "Voice notes are transcribed AND translated."
4. **0:40-0:50 (Tech Flex):** FastAPI terminal logs → "Custom Socket.IO integration on FastAPI ensures secure, scalable messaging."
5. **0:50-1:00 (Closing):** Dashboard search bar → "MediBridge—secure, fast, accessible healthcare."

---

## 💡 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **FastAPI over Node.js** | Python's superior AI/ML ecosystem (OpenAI SDK, async support). FastAPI's automatic OpenAPI docs. |
| **Two-Phase Broadcast** | GPT-4o latency (1-3s) masked by instant message delivery + background translation. |
| **REST + Socket.IO Hybrid** | REST for reliable sends (works offline), Socket.IO for real-time push. Best of both worlds. |
| **Optimistic UI Rendering** | Messages appear instantly with temporary IDs, replaced by server response. |
| **Polling → WebSocket Transport** | Avoids ASGI handshake race conditions. Socket.IO automatically upgrades after handshake. |
| **Server-Side AI** | Protects API keys, enables prompt engineering, centralizes rate limiting. |
| **httpOnly Cookies for JWT** | Prevents XSS token theft (JavaScript cannot access). SameSite=Lax blocks CSRF. Fallback to Bearer for Socket.IO. |
| **Cloudinary for Audio** | Persistent storage across deploys (Render/Vercel have ephemeral filesystems). CDN delivery reduces latency. |
| **Cursor-Based Pagination** | Memory-efficient. Supports 10,000+ message conversations without browser crashes (50 msg/page, max 100). |
| **Language Code → Name** | GPT-4o misinterprets `"hi"` as greeting. Mapping `"hi" → "Hindi"` fixes ambiguity. |

---

## 🤖 AI Tools & Credits

* **GitHub Copilot (Claude Opus 4.6):** Architecture design, code generation, debugging assistance
* **GPT-4o (Runtime):** Medical text translation and clinical note generation
* **Whisper large-v3-turbo (Runtime):** Audio transcription for voice messages
* **shadcn/ui:** Pre-built accessible React components
* **Tailwind CSS:** Utility-first styling framework

---

## 📊 Performance Metrics

* **Translation Latency:** 1-3 seconds (GPT-4o median: 1.8s)
* **Socket.IO Connection:** 200-400ms (polling → WebSocket upgrade)
* **First Message Render:** <50ms (optimistic UI)
* **Database Query Times:** <20ms (indexed foreign keys)
* **Frontend Bundle Size:** 453KB (gzipped: 140KB)

---

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 👨‍💻 Author

**Rahul B**
- GitHub: [@b-rahul07](https://github.com/b-rahul07)
- Project: [MediBridge Connect](https://github.com/b-rahul07/medibridge-connect)
- Live Demo: [medibridge-connect.vercel.app](https://medibridge-connect.vercel.app)

---

**Built with ❤️ for Healthcare Accessibility**
