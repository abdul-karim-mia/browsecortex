/**
 * Relay spawner (PLAN §21 Phase 2).
 * Provides one-click relay startup from extension settings.
 * Uses native messaging to spawn relay process on user's machine.
 *
 * Note: Requires native host helper (future implementation).
 * For now, provides UI + instructions.
 */

import { getConfig } from './config';
import { log } from '@/log';

export interface SpawnerStatus {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Attempt to start relay via native messaging.
 * Returns instructions if native helper not available.
 */
export async function startRelayProcess(): Promise<SpawnerStatus> {
  const cfg = await getConfig();

  // Try native messaging (Phase 3)
  if (typeof chrome !== 'undefined' && chrome.runtime?.connectNative) {
    try {
      const port = chrome.runtime.connectNative('com.browsecortex.relay');
      port.onMessage.addListener((msg: unknown) => {
        log.debug('[relay-spawner] Native response:', msg);
      });
      port.postMessage({
        action: 'start',
        port: cfg.port,
        token: cfg.token,
      });
      return {
        success: true,
        message: 'Relay startup command sent. Should start in 2-3 seconds.',
      };
    } catch (e) {
      log.debug('[relay-spawner] Native messaging not available:', e);
    }
  }

  // Fallback: provide npm command
  return {
    success: false,
    message: 'Copy & run this command in terminal:',
    error: `npm run relay (in project root)\n\nOr:\n\nnpx browsecortex-relay --port ${cfg.port} --token ${cfg.token}`,
  };
}

/**
 * Check if native helper is installed and accessible.
 */
export async function isNativeHelperAvailable(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connectNative) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative('com.browsecortex.relay');
      port.onMessage.addListener(() => resolve(true));
      port.onDisconnect.addListener(() => resolve(false));
      setTimeout(() => resolve(false), 2000);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Get human-readable startup instructions.
 */
export async function getStartupInstructions(): Promise<string> {
  const cfg = await getConfig();
  return `Start the relay server with this command:

npm run relay

Or manually:

npx browsecortex-relay --port ${cfg.port} --token ${cfg.token}

Then refresh this page. Connection should appear within 3 seconds.`;
}
