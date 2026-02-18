/**
 * API client for communication with the FastAPI backend.
 * Replaces all direct Supabase calls.
 */

// In development the Vite dev-server proxies API routes to the backend,
// so API_BASE should be '' (same origin).  In production, set VITE_API_URL.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── token helpers ─────────────────────────────────────────────────────
export function getToken(): string | null {
  return sessionStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  sessionStorage.setItem('auth_token', token);
}

export function clearToken(): void {
  sessionStorage.removeItem('auth_token');
}

// ── generic fetch wrapper ─────────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // only set content-type to JSON if body isn't FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  return res.json() as Promise<T>;
}

// ── types ─────────────────────────────────────────────────────────────
export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: 'doctor' | 'patient';
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

// Note: TokenResponse kept for backwards compatibility but tokens now in httpOnly cookies

export interface SessionOut {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  status: 'waiting' | 'active' | 'completed';
  patient_language: string | null;
  doctor_language: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string | null;
  patient?: UserOut | null;
  doctor?: UserOut | null;
}

export interface MessageOut {
  id: string;
  session_id: string;
  sender_id: string;
  content: string;
  translated_content: string | null;
  audio_url: string | null;
  created_at: string;
}

// ── auth ──────────────────────────────────────────────────────────────
export async function signup(
  email: string,
  password: string,
  full_name: string,
  role: 'doctor' | 'patient',
): Promise<UserOut> {
  const res = await request<TokenResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name, role }),
  });
  // Store token for cross-origin auth (production) & Socket.IO
  if (res.access_token) setToken(res.access_token);
  return res.user;
}

export async function login(
  email: string,
  password: string,
): Promise<UserOut> {
  const res = await request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  // Store token for cross-origin auth (production) & Socket.IO
  if (res.access_token) setToken(res.access_token);
  return res.user;
}

export async function getMe(): Promise<UserOut> {
  return request<UserOut>('/auth/me');
}

export function signOut(): void {
  clearToken();
  // Call logout endpoint to clear httpOnly cookie
  fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {/* ignore errors */ });
}

// ── consultations ─────────────────────────────────────────────────────
export async function requestConsultation(
  patientLanguage?: string,
): Promise<SessionOut> {
  return request<SessionOut>('/consultations/request', {
    method: 'POST',
    body: JSON.stringify({ patient_language: patientLanguage }),
  });
}

export async function acceptConsultation(
  sessionId: string,
  doctorLanguage?: string,
): Promise<SessionOut> {
  return request<SessionOut>(`/consultations/${sessionId}/accept`, {
    method: 'PUT',
    body: JSON.stringify({ doctor_language: doctorLanguage }),
  });
}

export async function endConsultation(
  sessionId: string,
  summary?: string,
): Promise<SessionOut> {
  return request<SessionOut>(`/consultations/${sessionId}/end`, {
    method: 'PUT',
    body: JSON.stringify({ summary }),
  });
}
export async function updateSessionLanguage(
  session_id: string,
  language: string,
): Promise<SessionOut> {
  return request<SessionOut>(`/consultations/${session_id}/language`, {
    method: 'PATCH',
    body: JSON.stringify({ language }),
  });
}

export async function listSessions(
  statusFilter?: string,
): Promise<SessionOut[]> {
  const qs = statusFilter ? `?status_filter=${statusFilter}` : '';
  return request<SessionOut[]>(`/consultations/${qs}`);
}

export async function getSession(sessionId: string): Promise<SessionOut> {
  return request<SessionOut>(`/consultations/${sessionId}`);
}

export async function searchMessagesDetail(query: string): Promise<MessageOut[]> {
  return request<MessageOut[]>(
    `/consultations/search/messages/detail?q=${encodeURIComponent(query)}`,
  );
}

// ── chat / messages ───────────────────────────────────────────────────
export async function getMessages(
  sessionId: string,
  limit?: number,
  cursor?: string,
): Promise<MessageOut[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return request<MessageOut[]>(`/chat/${sessionId}/messages${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch ALL messages for a session by paginating through all pages.
 * Used on initial load to get the complete history.
 */
export async function getAllMessages(sessionId: string): Promise<MessageOut[]> {
  const pageSize = 100;
  let all: MessageOut[] = [];
  let cursor: string | undefined;
  while (true) {
    const page = await getMessages(sessionId, pageSize, cursor);
    all = all.concat(page);
    if (page.length < pageSize) break; // last page
    cursor = page[page.length - 1].id;
  }
  return all;
}

/**
 * Send a text message via REST API (reliable fallback for Socket.IO).
 * The backend broadcasts the message to the Socket.IO room so both
 * participants receive the real-time event.
 */
export async function sendMessageRest(
  sessionId: string,
  content: string,
  senderLanguage?: string,
): Promise<MessageOut> {
  return request<MessageOut>(`/chat/${sessionId}/send`, {
    method: 'POST',
    body: JSON.stringify({ content, sender_language: senderLanguage }),
  });
}

export async function uploadAudio(
  sessionId: string,
  audioBlob: Blob,
  targetLanguage: string,
): Promise<MessageOut> {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('target_language', targetLanguage);
  form.append('file', audioBlob, 'recording.webm');

  return request<MessageOut>('/chat/upload-audio', {
    method: 'POST',
    body: form,
  });
}

// ── AI endpoints ──────────────────────────────────────────────────────
export async function translateText(
  text: string,
  targetLanguage: string,
): Promise<string> {
  const data = await request<{ translated_text: string }>('/ai/translate', {
    method: 'POST',
    body: JSON.stringify({ text, target_language: targetLanguage }),
  });
  return data.translated_text;
}

export async function summarizeSession(
  sessionId: string,
): Promise<string> {
  const data = await request<{ summary: string }>('/ai/summarize', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
  return data.summary;
}

// ── Socket.IO singleton ───────────────────────────────────────────────
import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

/**
 * Returns a shared Socket.IO instance, creating one if needed.
 * The socket authenticates with the current JWT token.
 */
export function getSocket(): Socket {
  if (!_socket) {
    // Phase 3 — Enforce secure WebSockets (wss://) in production.
    // Socket.IO's io() accepts an HTTP/HTTPS URL and handles the WS upgrade
    // internally, so we map https:// → wss:// and http:// → ws://.
    // In dev (no API_BASE), pass undefined so Vite's proxy handles routing.
    const wsBase = API_BASE
      ? API_BASE.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
      : undefined;

    _socket = io(wsBase, {
      // Send JWT token for auth (works cross-origin, unlike cookies)
      auth: { token: getToken() },
      // Also send cookies as fallback (same-origin / dev proxy)
      withCredentials: true,
      // Use polling first — avoids the "transport close" disconnect that
      // happens when WebSocket upgrade fails or races with the ASGI layer.
      // Socket.IO will automatically upgrade to WebSocket after the
      // initial handshake succeeds.
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    _socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('[WS] Socket connected, id:', _socket?.id);
    });
    _socket.on('connect_error', (err) => console.error('[WS] Connect error:', err.message));
    _socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('[WS] Socket disconnected:', reason);
      // Refresh token for reconnection attempt
      if (_socket) {
        _socket.auth = { token: getToken() };
      }
    });

    if (import.meta.env.DEV) {
      _socket.onAny((event, ...args) => {
        console.log(`[WS] ⇦ event "${event}"`, args.length ? args[0] : '');
      });
    }
  }
  return _socket;
}

/** Tear down the shared socket (call on sign-out). */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

export { API_BASE };
