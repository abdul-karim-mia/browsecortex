/**
 * Particle system for canvas glow animation
 * Manages creation, update, and rendering of particles with trail effects
 */

import { GLOW_CONFIG } from './glow-config';

export interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  edge: 'top' | 'right' | 'bottom' | 'left';
  progress: number;
  color: string;
  trail: Array<{ x: number; y: number }>;
  maxTrailLength: number;
}

export interface ParticleConfig {
  maxCount: number;
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  hueRange: [number, number];
  trailLength?: number;
}

export class ParticleSystem {
  private particles: Particle[];
  private config: ParticleConfig;
  private readonly defaultTrailLength = 8;

  constructor(config: ParticleConfig) {
    this.config = config;
    this.particles = [];
    this.initialize();
  }

  private initialize(): void {
    for (let i = 0; i < this.config.maxCount; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    const edge = this.randomEdge();
    const hue = this.randomHue();
    return {
      x: 0,
      y: 0,
      speed: this.config.speedMin + Math.random() * (this.config.speedMax - this.config.speedMin),
      size: this.config.sizeMin + Math.random() * (this.config.sizeMax - this.config.sizeMin),
      edge,
      progress: Math.random(),
      color: `hsla(${hue}, 90%, 65%, ${0.5 + Math.random() * 0.5})`,
      trail: [],
      maxTrailLength: this.config.trailLength || this.defaultTrailLength,
    };
  }

  private randomEdge(): Particle['edge'] {
    const edges: Particle['edge'][] = ['top', 'right', 'bottom', 'left'];
    return edges[Math.floor(Math.random() * 4)];
  }

  private randomHue(): number {
    const [min, max] = this.config.hueRange;
    return min + Math.random() * (max - min);
  }

  update(w: number, h: number): void {
    this.particles.forEach((p) => {
      // Update position
      p.progress += p.speed;
      if (p.progress > 1) {
        p.progress = 0;
        p.edge = this.randomEdge();
        p.trail = []; // Clear trail on edge switch
      }

      // Update trail
      const { x, y } = this.getEdgePosition(p, w, h);
      p.trail.push({ x, y });
      if (p.trail.length > p.maxTrailLength) {
        p.trail.shift();
      }
    });
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, enableTrails = true): void {
    // Render trails first (behind particles)
    if (enableTrails) {
      this.renderTrails(ctx);
    }

    // Render particles on top
    ctx.shadowBlur = 8;
    this.particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private renderTrails(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 6;
    this.particles.forEach((p) => {
      p.trail.forEach((point, index) => {
        // Fade older trail points
        const alpha = (index / p.trail.length) * 0.4;
        const trailColor = p.color.replace(/[\d.]+\)$/, `${alpha})`);
        const trailSize = p.size * (index / p.trail.length);

        ctx.fillStyle = trailColor;
        ctx.shadowColor = trailColor;
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(0.5, trailSize), 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  private getEdgePosition(p: Particle, w: number, h: number): { x: number; y: number } {
    switch (p.edge) {
      case 'top':
        p.x = p.progress * w;
        p.y = GLOW_CONFIG.border.inset;
        break;
      case 'right':
        p.x = w - GLOW_CONFIG.border.inset;
        p.y = p.progress * h;
        break;
      case 'bottom':
        p.x = (1 - p.progress) * w;
        p.y = h - GLOW_CONFIG.border.inset;
        break;
      case 'left':
        p.x = GLOW_CONFIG.border.inset;
        p.y = (1 - p.progress) * h;
        break;
    }
    return { x: p.x, y: p.y };
  }
}
