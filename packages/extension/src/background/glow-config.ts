/**
 * Canvas glow effect configuration
 * Centralized settings to eliminate magic numbers
 */

export const GLOW_CONFIG = {
  canvas: {
    id: '__browsecortex_glow__',
    zIndex: 2147483645,
    opacity: 0.9,
    blendMode: 'screen' as const,
  },
  border: {
    width: 4,
    shadowBlur: 12,
    inset: 2,
    pulseMin: 0.7,
    pulseMax: 1.0,
  },
  particles: {
    maxCount: 25,
    speedMin: 0.003,
    speedMax: 0.008,
    sizeMin: 1,
    sizeMax: 2.5,
    hueMin: 220,
    hueMax: 300,
  },
  animation: {
    pulseFrequency: 0.015, // Frame counter multiplier for Math.sin()
    colorRotationSpeed: 40, // ms per hue increment
  },
  rendering: {
    enableMultiLayer: true,
    enableTrails: true,
    enableScanlines: false,
    scanlineIntensity: 0.08,
    enableGradient: true,
  },
  performance: {
    enableColorCache: true,
    useFrameCounter: true,
  },
} as const;

export type GlowConfig = typeof GLOW_CONFIG;
