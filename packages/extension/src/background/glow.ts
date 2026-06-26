/**
 * Injects a glowing neon border and active particle flow onto the webpage canvas
 * to indicate that the BrowseCortex AI agent is currently working.
 *
 * Features:
 * - Particle trails (motion blur effect)
 * - Multi-layer glow (depth perception)
 * - State-aware colors (thinking/working/error)
 * - Scanline overlay (retro polish)
 * - Respects prefers-reduced-motion for accessibility
 * - Optimized with color caching and frame counter
 */
export async function injectGlowEffect(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.getElementById('__browsecortex_glow__')) return;

        const canvas = document.createElement('canvas');
        canvas.id = '__browsecortex_glow__';
        Object.assign(canvas.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: '2147483645',
          mixBlendMode: 'screen',
          opacity: '0.9',
        });

        document.documentElement.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Check accessibility preference
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let animationFrameId: number;
        let frameCount = 0;

        // Configuration
        const CONFIG = {
          particles: { maxCount: 25, speedMin: 0.003, speedMax: 0.008, sizeMin: 1, sizeMax: 2.5 },
          border: { inset: 2 },
          rendering: { enableMultiLayer: true, enableTrails: true, enableScanlines: false },
        };

        const resize = () => {
          canvas.width = window.innerWidth * window.devicePixelRatio;
          canvas.height = window.innerHeight * window.devicePixelRatio;
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        };

        window.addEventListener('resize', resize);
        resize();

        // Color cache
        const colorCache = new Map<string, string>();
        const getCachedColor = (hue: number, saturation: number, lightness: number, alpha: number): string => {
          const key = `${Math.round(hue)}_${saturation}_${lightness}_${Math.round(alpha * 100)}`;
          if (!colorCache.has(key)) {
            colorCache.set(key, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
          }
          return colorCache.get(key)!;
        };

        // Particle system with trails
        interface Particle {
          x: number;
          y: number;
          speed: number;
          size: number;
          edge: 'top' | 'right' | 'bottom' | 'left';
          progress: number;
          color: string;
          trail: Array<{ x: number; y: number }>;
        }

        const particles: Particle[] = [];

        const createParticle = (): Particle => {
          const edges: Particle['edge'][] = ['top', 'right', 'bottom', 'left'];
          const edge = edges[Math.floor(Math.random() * 4)];
          const hue = 220 + Math.random() * 80;
          return {
            x: 0,
            y: 0,
            speed: CONFIG.particles.speedMin + Math.random() * (CONFIG.particles.speedMax - CONFIG.particles.speedMin),
            size: CONFIG.particles.sizeMin + Math.random() * (CONFIG.particles.sizeMax - CONFIG.particles.sizeMin),
            edge,
            progress: Math.random(),
            color: getCachedColor(hue, 90, 65, 0.5 + Math.random() * 0.5),
            trail: [],
          };
        };

        for (let i = 0; i < CONFIG.particles.maxCount; i++) {
          particles.push(createParticle());
        }

        const getEdgePosition = (p: Particle, w: number, h: number): { x: number; y: number } => {
          switch (p.edge) {
            case 'top':
              return { x: p.progress * w, y: CONFIG.border.inset };
            case 'right':
              return { x: w - CONFIG.border.inset, y: p.progress * h };
            case 'bottom':
              return { x: (1 - p.progress) * w, y: h - CONFIG.border.inset };
            case 'left':
              return { x: CONFIG.border.inset, y: (1 - p.progress) * h };
          }
        };

        const renderTrails = (ctx: CanvasRenderingContext2D): void => {
          particles.forEach((p) => {
            p.trail.forEach((point, index) => {
              const alpha = (index / p.trail.length) * 0.4;
              const trailSize = p.size * (index / p.trail.length);
              ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${alpha})`);
              ctx.beginPath();
              ctx.arc(point.x, point.y, Math.max(0.5, trailSize), 0, Math.PI * 2);
              ctx.fill();
            });
          });
        };


        const renderScanlines = (ctx: CanvasRenderingContext2D, w: number, h: number, intensity = 0.08): void => {
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
        };

        // State-aware color palette
        const stateColors: Record<string, { hue: number; saturation: number; lightness: number }> = {
          idle: { hue: 200, saturation: 60, lightness: 50 },
          thinking: { hue: 240, saturation: 85, lightness: 60 },
          working: { hue: 220, saturation: 85, lightness: 60 },
          error: { hue: 0, saturation: 100, lightness: 60 },
        };

        let currentState: string = 'working';
        let previousState: string = 'working';
        let stateTransitionProgress = 0;

        const draw = () => {
          frameCount++;
          const w = window.innerWidth;
          const h = window.innerHeight;
          ctx.clearRect(0, 0, w, h);

          // Read state from window (updated via updateGlowState)
          const newState = (window as unknown as { __browsecortex_glow_state__?: string }).__browsecortex_glow_state__ || 'working';
          if (newState !== currentState) {
            previousState = currentState;
            currentState = newState;
            stateTransitionProgress = 0;
          }

          // Smooth state transition
          if (stateTransitionProgress < 1) {
            stateTransitionProgress += 0.05;
          }

          if (prefersReducedMotion) {
            // Reduced motion: static glow only
            const grad = ctx.createLinearGradient(0, 0, w, h);
            const color = stateColors[currentState] || stateColors.working;
            grad.addColorStop(0, getCachedColor(color.hue, color.saturation, color.lightness, 0.3));
            grad.addColorStop(1, getCachedColor((color.hue + 60) % 360, color.saturation, color.lightness, 0.3));
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 8;
            ctx.shadowColor = getCachedColor(color.hue, color.saturation, color.lightness, 0.5);
            ctx.strokeRect(0, 0, w, h);
          } else {
            // Full animation with state-aware colors
            const pulse = Math.sin(frameCount * 0.015) * 0.15 + 0.85;

            // Interpolate color between states
            const prevColor = stateColors[previousState] || stateColors.working;
            const currColor = stateColors[currentState] || stateColors.working;
            const hueBase = prevColor.hue + (currColor.hue - prevColor.hue) * stateTransitionProgress;
            const saturation = prevColor.saturation + (currColor.saturation - prevColor.saturation) * stateTransitionProgress;
            const lightness = prevColor.lightness + (currColor.lightness - prevColor.lightness) * stateTransitionProgress;

            const hue = (hueBase + (frameCount * 0.5)) % 360;

            // Render trails
            if (CONFIG.rendering.enableTrails) {
              ctx.shadowBlur = 6;
              renderTrails(ctx);
            }

            // Render border with state-aware colors
            if (CONFIG.rendering.enableMultiLayer) {
              // Layer 1: Inner bright border
              ctx.strokeStyle = getCachedColor(hue, Math.min(100, saturation + 15), Math.min(75, lightness + 20), 0.6 * pulse);
              ctx.lineWidth = 2;
              ctx.shadowBlur = 4;
              ctx.shadowColor = getCachedColor(hue, saturation, lightness, 0.8);
              ctx.strokeRect(2, 2, w - 4, h - 4);

              // Layer 2: Middle glow
              ctx.strokeStyle = getCachedColor(hue, saturation, lightness, 0.3 * pulse);
              ctx.lineWidth = 8;
              ctx.shadowBlur = 10;
              ctx.shadowColor = getCachedColor(hue, saturation, lightness, 0.6);
              ctx.strokeRect(2, 2, w - 4, h - 4);

              // Layer 3: Outer halo
              ctx.strokeStyle = getCachedColor(hue, Math.max(50, saturation - 20), Math.max(40, lightness - 10), 0.15 * pulse);
              ctx.lineWidth = 16;
              ctx.shadowBlur = 20;
              ctx.shadowColor = getCachedColor(hue, saturation, lightness, 0.3);
              ctx.strokeRect(2, 2, w - 4, h - 4);
            } else {
              const grad = ctx.createLinearGradient(0, 0, w, h);
              grad.addColorStop(0, getCachedColor(hue, saturation, lightness, 0.4 * pulse));
              grad.addColorStop(0.5, getCachedColor((hue + 60) % 360, saturation, lightness, 0.25 * pulse));
              grad.addColorStop(1, getCachedColor((hue + 120) % 360, saturation, lightness, 0.4 * pulse));
              ctx.strokeStyle = grad;
              ctx.lineWidth = 4;
              ctx.shadowBlur = 12 * pulse;
              ctx.shadowColor = getCachedColor(hue, saturation, lightness, 0.8);
              ctx.strokeRect(2, 2, w - 4, h - 4);
            }

            // Render particles
            ctx.shadowBlur = 8;
            particles.forEach((p) => {
              p.progress += p.speed;
              if (p.progress > 1) {
                p.progress = 0;
                const edges: Particle['edge'][] = ['top', 'right', 'bottom', 'left'];
                p.edge = edges[Math.floor(Math.random() * 4)];
                p.trail = [];
              }

              const pos = getEdgePosition(p, w, h);
              p.x = pos.x;
              p.y = pos.y;

              // Update trail
              p.trail.push({ x: pos.x, y: pos.y });
              if (p.trail.length > 8) {
                p.trail.shift();
              }

              ctx.fillStyle = p.color;
              ctx.shadowColor = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            });

            // Render scanlines (optional)
            if (CONFIG.rendering.enableScanlines) {
              renderScanlines(ctx, w, h, 0.08);
            }
          }

          animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        // Cleanup hook
        (window as unknown as { __browsecortex_glow_cleanup__?: () => void }).__browsecortex_glow_cleanup__ = () => {
          window.removeEventListener('resize', resize);
          cancelAnimationFrame(animationFrameId);
          canvas.remove();
          colorCache.clear();
          delete (window as unknown as { __browsecortex_glow_cleanup__?: () => void }).__browsecortex_glow_cleanup__;
        };
      },
    });
  } catch {
    // Ignore frame/security errors
  }
}

export async function updateGlowState(
  tabId: number,
  state: 'idle' | 'thinking' | 'working' | 'error'
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (newState: string) => {
        const glow = (window as unknown as {
          __browsecortex_glow_state__?: string;
        });
        glow.__browsecortex_glow_state__ = newState;
      },
      args: [state],
    });
  } catch {
    // Ignore frame/security errors
  }
}

export async function removeGlowEffect(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const cleanup = (window as unknown as { __browsecortex_glow_cleanup__?: () => void }).__browsecortex_glow_cleanup__;
        if (typeof cleanup === 'function') {
          try {
            cleanup();
          } catch {
            // ignore
          }
        } else {
          const canvas = document.getElementById('__browsecortex_glow__');
          canvas?.remove();
        }
      },
    });
  } catch {
    // Ignore
  }
}
