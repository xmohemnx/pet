'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { SocialMessage } from '@petra/contracts';
import { api } from '../lib/auth-client';

export function useChatRealtime(
  peerId: string | undefined,
  onMessages: (messages: SocialMessage[]) => void,
  onRevoked: () => void,
) {
  const [connected, setConnected] = useState(false),
    [online, setOnline] = useState<boolean | null>(null),
    [typing, setTyping] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    lastTyping = useRef(0);
  useEffect(() => {
    setConnected(false);
    setOnline(null);
    setTyping(false);
    if (!peerId) return;
    const abort = new AbortController();
    let live = true,
      ws: WebSocket | null = null,
      retry: ReturnType<typeof setTimeout> | undefined,
      expiry: ReturnType<typeof setTimeout> | undefined,
      busy = false,
      isConnected = false,
      lastRefresh = 0,
      backoff = 1000,
      connecting = false;
    const refresh = async () => {
      if (!live || busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const result = await fetch(`/api/v1/social/messages/${peerId}`, {
          cache: 'no-store',
          signal: abort.signal,
        });
        if ([401, 403, 404].includes(result.status)) {
          onRevoked();
          return;
        }
        if (!result.ok) throw new Error('unavailable');
        const messages = (await result.json()) as SocialMessage[];
        if (live) {
          onMessages(messages);
          lastRefresh = Date.now();
        }
      } catch {
        /* Network failures preserve the last authorized view; policy failures clear it. */
      } finally {
        busy = false;
      }
    };
    const connect = async () => {
      if (!live || connecting || document.visibilityState !== 'visible') return;
      connecting = true;
      try {
        const config = await api<{ enabled: boolean; url: string }>(
          'social/realtime',
          { signal: abort.signal },
        );
        if (!live) return;
        if (!config.enabled) throw new Error('unavailable');
        ws = new WebSocket(config.url, 'petra-chat-v1');
        ws.onmessage = (event) => {
          if (!live) return;
          let packet: {
            type: string;
            online?: boolean | null;
            typing?: boolean;
          };
          try {
            packet = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (packet.type === 'ready')
            ws?.send(JSON.stringify({ type: 'subscribe', peerId }));
          if (packet.type === 'subscribed') {
            socket.current = ws;
            connecting = false;
            isConnected = true;
            backoff = 1000;
            setConnected(true);
            void refresh();
          }
          if (packet.type === 'changed') void refresh();
          if (packet.type === 'revoked') {
            onRevoked();
            ws?.close();
          }
          if (packet.type === 'status') {
            setOnline(
              packet.online === true
                ? true
                : packet.online === false
                  ? false
                  : null,
            );
            setTyping(packet.typing === true);
            if (expiry) clearTimeout(expiry);
            if (packet.typing)
              expiry = setTimeout(() => setTyping(false), 5500);
          }
        };
        ws.onclose = () => {
          socket.current = null;
          connecting = false;
          isConnected = false;
          if (live) {
            setConnected(false);
            setOnline(null);
            setTyping(false);
            retry = setTimeout(() => void connect(), backoff);
            backoff = Math.min(30000, backoff * 2);
          }
        };
        ws.onerror = () => ws?.close();
      } catch {
        connecting = false;
        if (live) {
          retry = setTimeout(() => void connect(), backoff);
          backoff = Math.min(30000, backoff * 2);
        }
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          if (retry) clearTimeout(retry);
          void connect();
        }
      } else {
        ws?.close();
      }
    };
    document.addEventListener('visibilitychange', visible);
    void connect();
    const timer = setInterval(() => {
      if (!isConnected || Date.now() - lastRefresh > 30000) void refresh();
    }, 4000);
    return () => {
      live = false;
      abort.abort();
      if (retry) clearTimeout(retry);
      if (expiry) clearTimeout(expiry);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      ws?.close();
      socket.current = null;
    };
  }, [peerId, onMessages, onRevoked]);
  const indicateTyping = useCallback((active: boolean) => {
    if (active && Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'typing', active }));
  }, []);
  return { connected, online, typing, indicateTyping };
}
