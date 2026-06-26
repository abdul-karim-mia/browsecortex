/**
 * Relay launcher (PLAN §21 Phase 2).
 * Detects OS and provides instructions for launching the relay.
 * Future: Will support one-click launch via native messaging.
 */

export type OS = 'mac' | 'windows' | 'linux' | 'unknown';

export function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac os')) return 'mac';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

export interface RelayCommand {
  os: OS;
  command: string;
  shell: string;
  description: string;
}

export function getRelayCommand(port: number, token: string): RelayCommand {
  const base = `npx browsecortex-relay --port ${port} --token ${token}`;
  const os = detectOS();

  switch (os) {
    case 'mac':
    case 'linux':
      return {
        os,
        shell: 'bash',
        command: base,
        description: 'Open Terminal and paste the command below',
      };
    case 'windows':
      return {
        os,
        shell: 'powershell',
        command: base,
        description: 'Open PowerShell and paste the command below',
      };
    default:
      return {
        os: 'unknown',
        shell: 'bash/powershell',
        command: base,
        description: 'Open your terminal and run this command',
      };
  }
}

/**
 * Status of relay process (for Phase 2/3 auto-launcher).
 * Will be extended when native messaging is available.
 */
export interface RelayStatus {
  running: boolean;
  port?: number;
  pid?: number;
  error?: string;
}

/**
 * Check if relay is running by probing its /status endpoint.
 * (Already implemented in relay-client.ts, this is a convenience wrapper)
 */
export async function checkRelayStatus(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Future: Launch relay via native messaging (requires host setup).
 * Will be implemented in Phase 3 with host app support.
 */
export async function launchRelayNative(
  port: number,
  token: string,
): Promise<RelayStatus> {
  // Placeholder for Phase 3
  // Will use chrome.runtime.connectNative('browsecortex_relay_launcher')
  return { running: false, error: 'Native launcher not yet available' };
}
