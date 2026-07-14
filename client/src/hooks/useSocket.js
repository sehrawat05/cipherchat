import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshAccessToken } from '../api/client';

/**
 * Authenticated WebSocket with exponential-backoff reconnect. If the handshake
 * is rejected for an expired token (close code 1008) we rotate the access token
 * and retry, so a long-lived chat session survives token expiry seamlessly.
 *
 * status is one of: 'connecting' | 'open' | 'closed'
 */
export function useSocket({ enabled, onMessage }) {
  const [status, setStatus] = useState('closed');
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const retryRef = useRef(0);
  const closedByUs = useRef(false);

  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    socketRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setStatus('open');
    };

    ws.onmessage = (ev) => {
      try {
        onMessageRef.current(JSON.parse(ev.data));
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = async (ev) => {
      setStatus('closed');
      socketRef.current = null;
      if (closedByUs.current) return;

      // 1008 == auth rejected; refresh the token before reconnecting.
      if (ev.code === 1008) {
        await refreshAccessToken().catch(() => {});
      }
      const delay = Math.min(1000 * 2 ** retryRef.current, 15_000);
      retryRef.current += 1;
      setTimeout(() => {
        if (!closedByUs.current) connect();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    closedByUs.current = false;
    connect();
    return () => {
      closedByUs.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, connect]);

  const send = useCallback((payload) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
