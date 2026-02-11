/**
 * API client for communication with the FastAPI backend.
 * Replaces all direct Supabase calls.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── token helpers ─────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('auth_token');
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
): Promise<TokenResponse> {
  const data = await request<TokenResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name, role }),
  });
  setToken(data.access_token);
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const data = await request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function getMe(): Promise<UserOut> {
  return request<UserOut>('/auth/me');
}

export function signOut(): void {
  clearToken();
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

export async function listSessions(
  statusFilter?: string,
): Promise<SessionOut[]> {
  const qs = statusFilter ? `?status_filter=${statusFilter}` : '';
  return request<SessionOut[]>(`/consultations/${qs}`);
}

export async function getSession(sessionId: string): Promise<SessionOut> {
  return request<SessionOut>(`/consultations/${sessionId}`);
}

export async function searchMessages(query: string): Promise<SessionOut[]> {
  return request<SessionOut[]>(
    `/consultations/search/messages?q=${encodeURIComponent(query)}`,
  );
}

export async function searchMessagesDetail(query: string): Promise<MessageOut[]> {
  return request<MessageOut[]>(
    `/consultations/search/messages/detail?q=${encodeURIComponent(query)}`,
  );
}

// ── chat / messages ───────────────────────────────────────────────────
export async function getMessages(sessionId: string): Promise<MessageOut[]> {
  return request<MessageOut[]>(`/chat/${sessionId}/messages`);
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
    const token = getToken();
    _socket = io(API_BASE.replace(/\/+$/, ''), {
      auth: { token },
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

    _socket.on('connect', () => console.log('[WS] Socket connected, id:', _socket?.id));
    _socket.on('connect_error', (err) => console.error('[WS] Connect error:', err.message));
    _socket.on('disconnect', (reason) => {
      console.log('[WS] Socket disconnected:', reason);
      if (_socket) {
        _socket.auth = { token: getToken() };
      }
    });

    // Debug: log every event the server sends
    _socket.onAny((event, ...args) => {
      console.log(`[WS] ⇦ event "${event}"`, args.length ? args[0] : '');
    });
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
