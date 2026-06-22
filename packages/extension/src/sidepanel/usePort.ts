import { useEffect, useRef, useState } from 'preact/hooks';
import { PORT_NAME, type ClientMessage, type ServerMessage } from '@/background/protocol';

/**
 * Connects to the background 'chat' port (PLAN §23) and exposes a send fn
 * plus the streaming server messages.
 *
 * Automatically reconnects when the port is disconnected (e.g., MV3 service
 * worker termination). Without this, the second message silently fails.
 */
export function usePort(onMessage: (msg: ServerMessage) => void) {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;
    let port: chrome.runtime.Port | null = null;

    function connect() {
      if (typeof chrome === 'undefined' || !chrome.runtime?.connect) {
        console.error('[chat:port] chrome.runtime.connect unavailable');
        return;
      }
      try {
        console.log('[chat:port] connecting…');
        port = chrome.runtime.connect({ name: PORT_NAME });
        portRef.current = port;
        setConnected(true);
        console.log('[chat:port] connected');

        const listener = (msg: ServerMessage) => {
          console.log('[chat:port] recv', msg.type, msg);
          handlerRef.current(msg);
        };
        port.onMessage.addListener(listener);
        port.onDisconnect.addListener(() => {
          console.warn('[chat:port] disconnected', chrome.runtime.lastError);
          setConnected(false);
          portRef.current = null;
          port = null;
          // MV3 may terminate the SW after idle; retry so future sends work.
          if (!cancelled) setTimeout(connect, 500);
        });
      } catch (e) {
        console.error('[chat:port] connect threw', e);
        setConnected(false);
        portRef.current = null;
        if (!cancelled) setTimeout(connect, 1000);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (port) {
        port.disconnect();
        port = null;
        portRef.current = null;
      }
    };
  }, []);

  const send = (msg: ClientMessage) => {
    console.log('[chat:port] send', msg.type, msg);
    if (!portRef.current) {
      console.error('[chat:port] send failed — no active port', msg);
      return;
    }
    try {
      portRef.current.postMessage(msg);
    } catch (e) {
      console.error('[chat:port] postMessage threw', e, msg);
    }
  };

  return { send, connected };
}
