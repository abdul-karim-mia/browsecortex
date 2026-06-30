/**
 * Connection Manager (PLAN §21 Phase 1.5).
 * Provides smooth connection experience with:
 * - Better status polling
 * - Connection hints/diagnostics
 * - Progress tracking
 * - Auto-recovery suggestions
 */

import { getConfig } from './config';
import { log } from '@/log';

export type ConnectionStatus =
  | 'disabled'
  | 'waiting-for-relay'
  | 'connected'
  | 'failed';

export interface ConnectionState {
  status: ConnectionStatus;
  message: string;
  suggestion?: string;
  lastError?: string;
}

let connectionState: ConnectionState = {
  status: 'disabled',
  message: 'MCP Server disabled',
};

// Track actual WebSocket connection (set by relay-client)
let webSocketConnected = false;

const listeners = new Set<(state: ConnectionState) => void>();

export function subscribeToConnectionState(callback: (state: ConnectionState) => void): () => void {
  listeners.add(callback);
  callback(connectionState);
  return () => listeners.delete(callback);
}

function updateState(state: Partial<ConnectionState>) {
  connectionState = { ...connectionState, ...state };
  listeners.forEach((cb) => cb(connectionState));
  log.debug('[connection-manager]', connectionState.message);
}

/** Called by relay-client when WebSocket connects/disconnects. */
export function setWebSocketConnected(connected: boolean): void {
  webSocketConnected = connected;
  if (connected) {
    updateState({
      status: 'connected',
      message: '✓ Relay connected and ready',
      suggestion: undefined,
    });
  } else {
    // If WebSocket disconnects, go back to waiting state
    getConfig().then((cfg) => {
      if (cfg.enabled) {
        updateState({
          status: 'waiting-for-relay',
          message: 'Relay connection lost. Reconnecting...',
          suggestion: 'Extension is attempting to reconnect automatically.',
        });
      }
    });
  }
}

async function checkRelayHealth(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${port}/status`, {
      headers: { Authorization: 'Bearer __health__' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok || res.status === 401; // 401 = relay is up but token wrong
  } catch (e) {
    return false;
  }
}

/**
 * Main monitoring: check if relay is running and update state.
 * Actual WebSocket connection is reported by relay-client separately.
 */
export async function checkRelayStatus(): Promise<void> {
  const cfg = await getConfig();

  if (!cfg.enabled) {
    updateState({
      status: 'disabled',
      message: 'MCP Server disabled',
      suggestion: undefined,
    });
    return;
  }

  // If WebSocket is already connected, we're good
  if (webSocketConnected) {
    updateState({
      status: 'connected',
      message: '✓ Relay connected and ready',
      suggestion: undefined,
    });
    return;
  }

  // Check if relay is running
  const relayRunning = await checkRelayHealth(cfg.port);

  if (relayRunning) {
    // Relay is running but WebSocket not yet connected
    updateState({
      status: 'waiting-for-relay',
      message: 'Relay detected, establishing connection...',
      suggestion: 'WebSocket handshake in progress. Please wait.',
    });
  } else {
    // Relay not running
    updateState({
      status: 'failed',
      message: 'Relay not running',
      suggestion: `Start relay: npx browsecortex-relay --port ${cfg.port} --token ${cfg.token.slice(0, 10)}…`,
      lastError: `Port ${cfg.port} not responding`,
    });
  }
}

/**
 * Continuous monitoring: check relay health periodically.
 */
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startMonitoring(intervalMs = 4000): void {
  if (monitorInterval) clearInterval(monitorInterval);

  // Check immediately
  checkRelayStatus();

  // Then check periodically
  monitorInterval = setInterval(() => {
    checkRelayStatus();
  }, intervalMs);
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}
