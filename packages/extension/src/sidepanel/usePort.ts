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
      if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return;
      try {
        port = chrome.runtime.connect({ name: PORT_NAME });
        portRef.current = port;
        setConnected(true);

        const listener = (msg: ServerMessage) => handlerRef.current(msg);
        port.onMessage.addListener(listener);
        port.onDisconnect.addListener(() => {
          setConnected(false);
          portRef.current = null;
          port = null;
          // MV3 may terminate the SW after idle; retry so future sends work.
          if (!cancelled) setTimeout(connect, 500);
        });
      } catch {
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

  const send = (msg: ClientMessage) => portRef.current?.postMessage(msg);

  return { send, connected };
}
