import { useState, useEffect, useCallback, useRef } from 'react';
import { getMessages, getSocket, sendMessageRest, MessageOut } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export const useMessages = (sessionId: string) => {
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const joinedRef = useRef(false);
  const { user } = useAuth();

  // ── Fetch initial messages + subscribe to real-time via Socket.IO ──
  useEffect(() => {
    if (!sessionId) return;
    joinedRef.current = false;

    // A) REST fetch for existing messages
    const fetchInitial = async () => {
      setLoading(true);
      try {
        const data = await getMessages(sessionId);
        setMessages(data);
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();

    // B) Shared Socket.IO instance from api.ts
    const socket = getSocket();
    setConnected(socket.connected);
    console.log('[WS] Socket state — connected:', socket.connected, 'id:', socket.id);

    // Join the session room (server groups messages by room)
    const joinRoom = () => {
      if (joinedRef.current) return;
      console.log('[WS] Emitting join_room for session', sessionId, '| socket.connected:', socket.connected);
      socket.emit('join_room', { session_id: sessionId });
      joinedRef.current = true;
    };

    // If already connected, join immediately; ALSO listen for (re)connect
    if (socket.connected) {
      joinRoom();
    }
    // Always register the connect handler so we re-join after reconnects
    const onConnect = () => {
      console.log('[WS] (Re)connected — id:', socket.id, '— re-joining room', sessionId);
      setConnected(true);
      joinedRef.current = false;
      joinRoom();
    };
    socket.on('connect', onConnect);

    const onDisconnect = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
    };
    socket.on('disconnect', onDisconnect);

    // Error listeners for debugging
    const onError = (err: Error) => console.error('[WS] Socket error:', err);
    socket.on('error', onError);

    // Listen for incoming messages (dedup guard by id)
    const onNewMessage = (msg: MessageOut) => {
      console.log('[WS] >>> new_message received:', msg.id);
      setMessages((prev) => {
        // Remove any optimistic placeholder with matching content + sender
        const withoutOptimistic = prev.filter(
          (m) => !m.id.startsWith('temp-') || m.content !== msg.content || m.sender_id !== msg.sender_id
        );
        // Dedup guard (skip if already present by real id)
        if (withoutOptimistic.some((m) => m.id === msg.id)) return withoutOptimistic;
        return [...withoutOptimistic, msg];
      });
    };
    socket.on('new_message', onNewMessage);

    // Listen for translation updates (phase 2 of two-phase broadcast)
    const onMessageUpdated = (update: { id: string; translated_content: string }) => {
      console.log('[WS] >>> message_updated:', update.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === update.id
            ? { ...m, translated_content: update.translated_content }
            : m
        )
      );
    };
    socket.on('message_updated', onMessageUpdated);

    // C) Cleanup: remove listeners & leave room on unmount / sessionId change
    return () => {
      console.log('[WS] Cleanup for session', sessionId, '| connected:', socket.connected);
      if (socket.connected) {
        socket.emit('leave_room', { session_id: sessionId });
      }
      socket.off('new_message', onNewMessage);
      socket.off('message_updated', onMessageUpdated);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('error', onError);
      joinedRef.current = false;
    };
  }, [sessionId]);

  // ── Send a message: optimistic UI + REST API (reliable) ────────────
  const sendMessage = useCallback(
    async (content: string, senderLanguage?: string) => {
      if (!sessionId || !content.trim()) return;

      const trimmed = content.trim();

      // Optimistic: add a temporary message to state immediately
      const tempId = `temp-${Date.now()}`;
      const optimistic: MessageOut = {
        id: tempId,
        session_id: sessionId,
        sender_id: user?.id ?? '',
        content: trimmed,
        translated_content: null,
        audio_url: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      // Send via REST API (always reliable, no socket dependency)
      try {
        await sendMessageRest(sessionId, trimmed, senderLanguage);
        console.log('[REST] Message sent successfully');
        // The server broadcasts via Socket.IO — our onNewMessage handler
        // will replace the optimistic message with the real one.
      } catch (error) {
        console.error('[REST] Failed to send message:', error);
        // Remove the optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw error; // re-throw so caller can show error to user
      }
    },
    [sessionId, user?.id]
  );

  return {
    messages,
    loading,
    connected,
    sendMessage,
  };
};
