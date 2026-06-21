import { useEffect, useRef, useState } from 'preact/hooks';
import { PORT_NAME, type ClientMessage, type ServerMessage } from '@/background/protocol';

/**
 * Connects to the background 'chat' port (PLAN §23) and exposes a send fn
 * plus the streaming server messages.
 */
export function usePort(onMessage: (msg: ServerMessage) => void) {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return;
    const port = chrome.runtime.connect({ name: PORT_NAME });
    portRef.current = port;
    setConnected(true);

    const listener = (msg: ServerMessage) => handlerRef.current(msg);
    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(() => setConnected(false));

    return () => {
      port.onMessage.removeListener(listener);
      port.disconnect();
    };
  }, []);

  const send = (msg: ClientMessage) => portRef.current?.postMessage(msg);

  return { send, connected };
}
