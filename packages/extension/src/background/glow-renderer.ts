/**
 * Canvas glow renderer with multi-layer support and state-aware colors
 * Handles border rendering with dynamic layers and color transitions
 */

import { AnimationState } from './glow-animator';

export interface ColorConfig {
  hue: number;
  saturation: number;
  lightness: number;
}

export const STATE_COLORS: Record<AnimationState, ColorConfig> = {
  idle: { hue: 200, saturation: 60, lightness: 50 },
  thinking: { hue: 240, saturation: 85, lightness: 60 },
  working: { hue: 220, saturation: 85, lightness: 60 },
  error: { hue: 0, saturation: 100, lightness: 60 },
};

export interface GlowRenderConfig {
  enableMultiLayer: boolean;
  enableScanlines: boolean;
  scanlineIntensity: number;
  enableGradient: boolean;
}

export class GlowRenderer {
  private colorCache = new Map<string, string>();

  private getCachedColor(
    hue: number,
    saturation: number,
    lightness: number,
    alpha: number
  ): string {
    const key = `${Math.round(hue)}_${saturation}_${lightness}_${Math.round(alpha * 100)}`;
    if (!this.colorCache.has(key)) {
      this.colorCache.set(
        key,
        `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
      );
    }
    return this.colorCache.get(key)!;
  }

  private interpolateColor(
    from: ColorConfig,
    to: ColorConfig,
    progress: number
  ): ColorConfig {
    return {
      hue: from.hue + (to.hue - from.hue) * progress,
      saturation: from.saturation + (to.saturation - from.saturation) * progress,
      lightness: from.lightness + (to.lightness - from.lightness) * progress,
    };
  }

  renderBorder(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pulse: number,
    color: ColorConfig,
    config: GlowRenderConfig
  ): void {
    if (config.enableMultiLayer) {
      this.renderMultiLayerBorder(ctx, w, h, pulse, color);
    } else {
      this.renderSimpleBorder(ctx, w, h, pulse, color);
    }

    if (config.enableScanlines) {
      this.renderScanlines(ctx, w, h, config.scanlineIntensity);
    }
  }

  private renderSimpleBorder(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pulse: number,
    color: ColorConfig
  ): void {
    const borderColor = this.getCachedColor(
      color.hue,
      color.saturation,
      color.lightness,
      0.4 * pulse
    );

    if (ctx.createLinearGradient) {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(
        0,
        this.getCachedColor(color.hue, color.saturation, color.lightness, 0.4 * pulse)
      );
      grad.addColorStop(
        0.5,
        this.getCachedColor(
          (color.hue + 60) % 360,
          color.saturation,
          color.lightness,
          0.25 * pulse
        )
      );
      grad.addColorStop(
        1,
        this.getCachedColor(
          (color.hue + 120) % 360,
          color.saturation,
          color.lightness,
          0.4 * pulse
        )
      );
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = borderColor;
    }

    ctx.lineWidth = 4;
    ctx.shadowBlur = 12 * pulse;
    ctx.shadowColor = this.getCachedColor(
      color.hue,
      color.saturation,
      color.lightness,
      0.8
    );
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  private renderMultiLayerBorder(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pulse: number,
    color: ColorConfig
  ): void {
    // Layer 1: Inner bright border
    ctx.strokeStyle = this.getCachedColor(color.hue, 100, 70, 0.6 * pulse);
    ctx.lineWidth = 2;
    ctx.shadowBlur = 4;
    ctx.shadowColor = this.getCachedColor(color.hue, 100, 70, 0.8);
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Layer 2: Middle glow
    ctx.strokeStyle = this.getCachedColor(color.hue, 80, 60, 0.3 * pulse);
    ctx.lineWidth = 8;
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.getCachedColor(color.hue, 85, 60, 0.6);
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Layer 3: Outer halo
    ctx.strokeStyle = this.getCachedColor(color.hue, 70, 50, 0.15 * pulse);
    ctx.lineWidth = 16;
    ctx.shadowBlur = 40;
    ctx.shadowColor = this.getCachedColor(color.hue, 85, 60, 0.3);
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  private renderScanlines(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    intensity: number
  ): void {
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    for (let y = 0; y < h; y += 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  transitionColor(
    fromState: AnimationState,
    toState: AnimationState,
    progress: number
  ): ColorConfig {
    const from = STATE_COLORS[fromState];
    const to = STATE_COLORS[toState];
    return this.interpolateColor(from, to, progress);
  }

  getStateColor(state: AnimationState): ColorConfig {
    return STATE_COLORS[state];
  }

  clearCache(): void {
    this.colorCache.clear();
  }
}
