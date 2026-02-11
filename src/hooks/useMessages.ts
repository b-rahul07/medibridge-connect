import { useState, useEffect, useCallback, useRef } from 'react';
import { getMessages, getSocket, MessageOut } from '@/lib/api';

export const useMessages = (sessionId: string) => {
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const joinedRef = useRef(false);

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
      joinedRef.current = false;
      joinRoom();
    };
    socket.on('connect', onConnect);

    // Error listeners for debugging
    const onError = (err: Error) => console.error('[WS] Socket error:', err);
    socket.on('error', onError);

    // Listen for incoming messages (dedup guard by id)
    const onNewMessage = (msg: MessageOut) => {
      console.log('[WS] >>> new_message received:', msg.id);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
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
      // ONLY emit leave_room if connected — otherwise Socket.IO buffers
      // the event and sends it AFTER the next reconnect, which would
      // remove the user from the room they just re-joined.
      if (socket.connected) {
        socket.emit('leave_room', { session_id: sessionId });
      }
      socket.off('new_message', onNewMessage);
      socket.off('message_updated', onMessageUpdated);
      socket.off('connect', onConnect);
      socket.off('error', onError);
      joinedRef.current = false;
    };
  }, [sessionId]);

  // ── Send a message via Socket.IO ───────────────────────────────────
  const sendMessage = useCallback(
    async (
      content: string,
      _senderId: string,
      _translatedContent?: string,
      _originalLang?: string,
      targetLang?: string,
      _isAudio: boolean = false
    ) => {
      if (!sessionId || !content.trim()) return;

      const socket = getSocket();
      console.log('[WS] sendMessage — connected:', socket.connected, 'sessionId:', sessionId, 'targetLang:', targetLang);
      if (socket.connected) {
        socket.emit('send_message', {
          session_id: sessionId,
          content: content.trim(),
          target_language: targetLang || 'en',
        });
        console.log('[WS] send_message emitted');
      } else {
        console.error('[WS] Socket not connected! Cannot send message. Attempting reconnect...');
        socket.connect();
      }
    },
    [sessionId]
  );

  return {
    messages,
    loading,
    sendMessage,
  };
};
