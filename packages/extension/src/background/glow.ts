/**
 * Injects a glowing neon border and active particle flow onto the webpage canvas
 * to indicate that the BrowseCortex AI agent is currently working.
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

        let animationFrameId: number;

        const resize = () => {
          canvas.width = window.innerWidth * window.devicePixelRatio;
          canvas.height = window.innerHeight * window.devicePixelRatio;
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        };

        window.addEventListener('resize', resize);
        resize();

        // Particle system for the AI active state along borders
        interface Particle {
          x: number;
          y: number;
          speed: number;
          size: number;
          edge: 'top' | 'right' | 'bottom' | 'left';
          progress: number; // 0 to 1 along the edge
          color: string;
        }

        const particles: Particle[] = [];
        const maxParticles = 25;

        const createParticle = (): Particle => {
          const edges: Particle['edge'][] = ['top', 'right', 'bottom', 'left'];
          const edge = edges[Math.floor(Math.random() * 4)];
          const hue = (220 + Math.random() * 80) % 360; // Indigo to Purple / Cyan range
          return {
            x: 0,
            y: 0,
            speed: 0.003 + Math.random() * 0.005,
            size: 1 + Math.random() * 2.5,
            edge,
            progress: Math.random(),
            color: `hsla(${hue}, 90%, 65%, ${0.5 + Math.random() * 0.5})`,
          };
        };

        for (let i = 0; i < maxParticles; i++) {
          particles.push(createParticle());
        }

        const draw = () => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          ctx.clearRect(0, 0, w, h);

          const time = Date.now() * 0.0025;
          const pulse = Math.sin(time) * 0.15 + 0.85; // 0.7 to 1.0 pulse

          // Shifting gradient color palette: Indigo to Cyan-Purple
          const grad = ctx.createLinearGradient(0, 0, w, h);
          const hue1 = (Date.now() / 40) % 360;
          const hue2 = (hue1 + 120) % 360;
          grad.addColorStop(0, `hsla(${hue1}, 85%, 60%, ${0.4 * pulse})`);
          grad.addColorStop(0.5, `hsla(${(hue1 + 60) % 360}, 85%, 60%, ${0.25 * pulse})`);
          grad.addColorStop(1, `hsla(${hue2}, 85%, 60%, ${0.4 * pulse})`);

          // Draw Glowing Border Frame
          ctx.strokeStyle = grad;
          ctx.lineWidth = 4;
          ctx.shadowBlur = 12 * pulse;
          ctx.shadowColor = `hsla(${hue1}, 85%, 60%, 0.8)`;
          ctx.strokeRect(2, 2, w - 4, h - 4);

          // Draw moving border particles
          ctx.shadowBlur = 8;
          particles.forEach((p) => {
            p.progress += p.speed;
            if (p.progress > 1) {
              p.progress = 0;
              const edges: Particle['edge'][] = ['top', 'right', 'bottom', 'left'];
              p.edge = edges[Math.floor(Math.random() * 4)];
            }

            // Map progress along the edge
            if (p.edge === 'top') {
              p.x = p.progress * w;
              p.y = 2;
            } else if (p.edge === 'right') {
              p.x = w - 2;
              p.y = p.progress * h;
            } else if (p.edge === 'bottom') {
              p.x = (1 - p.progress) * w;
              p.y = h - 2;
            } else if (p.edge === 'left') {
              p.x = 2;
              p.y = (1 - p.progress) * h;
            }

            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          });

          animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        // Attach cleanup hook to window object so it can be cleanly detached
        (window as unknown as { __browsecortex_glow_cleanup__?: () => void }).__browsecortex_glow_cleanup__ = () => {
          window.removeEventListener('resize', resize);
          cancelAnimationFrame(animationFrameId);
          canvas.remove();
          delete (window as unknown as { __browsecortex_glow_cleanup__?: () => void }).__browsecortex_glow_cleanup__;
        };
      },
    });
  } catch {
    // Ignore frame/security errors on specific tabs (e.g. settings or system pages)
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
