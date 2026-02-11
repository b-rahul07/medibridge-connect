import { useState, useCallback, useEffect, useRef } from 'react';
import {
  listSessions,
  requestConsultation,
  acceptConsultation,
  endConsultation,
  SessionOut,
} from '@/lib/api';

export type { SessionOut as Session };

export const useSessions = () => {
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDone = useRef(false);

  // Poll interval ref for real-time-like updates
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSessions = useCallback(async (isPolling = false) => {
    // Only show 'loading' on the initial fetch, not on background polls
    if (!isPolling) setLoading(true);
    setError(null);

    try {
      const data = await listSessions();
      setSessions(data);
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sessions';
      console.error('Error fetching sessions:', err);
      setError(message);
      throw err;
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []);

  // Start polling for session updates
  useEffect(() => {
    // Initial fetch
    fetchSessions().then(() => { initialFetchDone.current = true; }).catch(() => {});

    pollRef.current = setInterval(() => {
      fetchSessions(true).catch(() => {});
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSessions]);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await requestConsultation();
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      console.error('Error creating session:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptSession = useCallback(async (
    sessionId: string,
    _doctorId?: string,
    navigate?: (path: string) => void
  ) => {
    setLoading(true);
    setError(null);

    try {
      const data = await acceptConsultation(sessionId);

      if (navigate) {
        navigate(`/session/${sessionId}`);
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to accept session';
      console.error('Error accepting session:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const endSessionHook = useCallback(async (
    sessionId: string,
    summaryText: string,
    _userId?: string,
    _role?: 'doctor' | 'patient'
  ) => {
    setLoading(true);
    setError(null);

    try {
      const data = await endConsultation(sessionId, summaryText);
      await fetchSessions();
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to end session';
      console.error('Error ending session:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    createSession,
    fetchSessions,
    acceptSession,
    endSession: endSessionHook,
  };
};
