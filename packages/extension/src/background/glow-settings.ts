/**
 * Glow effect settings management
 * Stores user preferences for glow appearance and behavior
 */

export interface GlowSettings {
  enabled: boolean;
  enabledMultiLayer: boolean;
  enableTrails: boolean;
  enableScanlines: boolean;
  intensity: 'low' | 'medium' | 'high';
  theme: 'default' | 'neon' | 'calm';
  particleCount: number;
}

export const DEFAULT_GLOW_SETTINGS: GlowSettings = {
  enabled: true,
  enabledMultiLayer: true,
  enableTrails: true,
  enableScanlines: false,
  intensity: 'medium',
  theme: 'default',
  particleCount: 25,
};

export const GLOW_THEMES = {
  default: {
    idle: { hue: 200, saturation: 60, lightness: 50 },
    thinking: { hue: 240, saturation: 85, lightness: 60 },
    working: { hue: 220, saturation: 85, lightness: 60 },
    error: { hue: 0, saturation: 100, lightness: 60 },
  },
  neon: {
    idle: { hue: 200, saturation: 100, lightness: 50 },
    thinking: { hue: 240, saturation: 100, lightness: 55 },
    working: { hue: 180, saturation: 100, lightness: 50 },
    error: { hue: 0, saturation: 100, lightness: 65 },
  },
  calm: {
    idle: { hue: 200, saturation: 40, lightness: 60 },
    thinking: { hue: 240, saturation: 50, lightness: 65 },
    working: { hue: 220, saturation: 50, lightness: 60 },
    error: { hue: 0, saturation: 70, lightness: 65 },
  },
};

const STORAGE_KEY = 'browsecortex_glow_settings';

/**
 * Load glow settings from Chrome storage
 */
export async function loadGlowSettings(): Promise<GlowSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const settings = result[STORAGE_KEY];
      resolve(settings ? { ...DEFAULT_GLOW_SETTINGS, ...settings } : DEFAULT_GLOW_SETTINGS);
    });
  });
}

/**
 * Save glow settings to Chrome storage
 */
export async function saveGlowSettings(settings: Partial<GlowSettings>): Promise<void> {
  return new Promise((resolve) => {
    const current = { ...DEFAULT_GLOW_SETTINGS, ...settings };
    chrome.storage.local.set({ [STORAGE_KEY]: current }, () => {
      resolve();
    });
  });
}

/**
 * Get particle count based on intensity
 */
export function getParticleCountForIntensity(intensity: 'low' | 'medium' | 'high'): number {
  switch (intensity) {
    case 'low':
      return 15;
    case 'medium':
      return 25;
    case 'high':
      return 35;
    default:
      return 25;
  }
}

/**
 * Get opacity modifier based on intensity
 */
export function getOpacityModifier(intensity: 'low' | 'medium' | 'high'): number {
  switch (intensity) {
    case 'low':
      return 0.6;
    case 'medium':
      return 0.9;
    case 'high':
      return 1.0;
    default:
      return 0.9;
  }
}
