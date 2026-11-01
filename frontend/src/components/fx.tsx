import { useEffect, useRef } from 'react';
import type { Rank } from '@shared';
import { RANK_COLORS } from '../lib/theme';

// Canvas effects: generative level-up art (from LevelUp) and rank-scaled ambient particles
// (from THE-SYSTEM). Both skip animation entirely for prefers-reduced-motion.

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

type Frame = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
type Sim = (w: number, h: number, c1: string, c2: string) => Frame;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const SIMS: Sim[] = [
  // Burst: particles explode from the centre and fall away
  (w, h, c1, c2) => {
    const ps = Array.from({ length: 220 }, () => {
      const a = rand(0, Math.PI * 2);
      const v = rand(1, 9);
      return { x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: Math.random() < 0.5 ? c1 : c2, r: rand(1, 2.6) };
    });
    return (ctx) => ps.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.04;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
  },
  // Constellation: drifting stars linked by faint lines
  (w, h, c1, c2) => {
    const ps = Array.from({ length: Math.min(90, Math.floor(w / 9)) }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5) }));
    return (ctx) => {
      for (const p of ps) { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
        if (d < 110) { ctx.strokeStyle = c2; ctx.globalAlpha = 1 - d / 110; ctx.beginPath(); ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y); ctx.stroke(); }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = c1;
      for (const p of ps) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    };
  },
  // Lissajous curve drawn with a glowing pen
  (w, h, c1) => {
    const a = Math.floor(rand(1, 6)), b = Math.floor(rand(1, 6)) || 2, d = rand(0, Math.PI);
    const R = Math.min(w, h) * 0.38;
    return (ctx, _w, _h, t) => {
      ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = c1;
      ctx.beginPath();
      for (let s = t * 0.02 - 0.06; s < t * 0.02; s += 0.003) {
        const x = w / 2 + R * Math.sin(a * s + d), y = h / 2 + R * Math.sin(b * s);
        s === t * 0.02 - 0.06 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
    };
  },
  // Spirograph (hypotrochoid)
  (w, h, c1, c2) => {
    const R = Math.min(w, h) * 0.3, r = R * rand(0.2, 0.7), d = r * rand(0.6, 1.4);
    let prev: [number, number] | null = null;
    return (ctx, _w, _h, t) => {
      for (let k = 0; k < 6; k++) {
        const s = (t * 6 + k) * 0.02;
        const x = w / 2 + (R - r) * Math.cos(s) + d * Math.cos(((R - r) / r) * s);
        const y = h / 2 + (R - r) * Math.sin(s) - d * Math.sin(((R - r) / r) * s);
        if (prev) { ctx.strokeStyle = k % 2 ? c1 : c2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke(); }
        prev = [x, y];
      }
    };
  },
  // Vortex: particles spiral into the centre
  (w, h, c1, c2) => {
    const ps = Array.from({ length: 260 }, () => ({ a: rand(0, Math.PI * 2), r: rand(40, Math.max(w, h) * 0.7), s: rand(0.004, 0.02), c: Math.random() < 0.5 ? c1 : c2 }));
    return (ctx) => ps.forEach((p) => {
      p.a += p.s * (300 / (p.r + 40)); p.r *= 0.994; if (p.r < 4) p.r = Math.max(w, h) * 0.7;
      ctx.fillStyle = p.c; ctx.fillRect(w / 2 + Math.cos(p.a) * p.r, h / 2 + Math.sin(p.a) * p.r, 2, 2);
    });
  },
  // Embers rising from the ground
  (w, h, c1, c2) => {
    const ps = Array.from({ length: 160 }, () => ({ x: rand(0, w), y: rand(h * 0.5, h * 1.3), v: rand(0.8, 3), sway: rand(0, 6), c: Math.random() < 0.6 ? c1 : c2 }));
    return (ctx, _w, _h, t) => ps.forEach((p) => {
      p.y -= p.v; if (p.y < -10) { p.y = h + 10; p.x = rand(0, w); }
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 0.03 + p.sway) * 8, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
    });
  },
  // Ripples expanding from the centre
  (w, h, c1, c2) => (ctx, _w, _h, t) => {
    for (let k = 0; k < 5; k++) {
      const r = ((t * 3 + k * 70) % 360);
      ctx.strokeStyle = k % 2 ? c1 : c2; ctx.globalAlpha = 1 - r / 360; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, r * (Math.max(w, h) / 360), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  // Lorenz attractor
  (w, h, c1, c2) => {
    let x = 0.1, y = 0, z = 0, n = 0;
    const S = Math.min(w, h) / 60;
    return (ctx) => {
      for (let k = 0; k < 12; k++) {
        const dt = 0.008;
        const nx = x + 10 * (y - x) * dt, ny = y + (x * (28 - z) - y) * dt, nz = z + (x * y - (8 / 3) * z) * dt;
        ctx.strokeStyle = n++ % 400 < 200 ? c1 : c2; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(w / 2 + x * S, h / 2 + (z - 25) * S); ctx.lineTo(w / 2 + nx * S, h / 2 + (nz - 25) * S); ctx.stroke();
        x = nx; y = ny; z = nz;
      }
    };
  },
];

/** Index of the vortex sim in SIMS, used for the Gate's portal. */
export const VORTEX_SIM = 4;

/** Full-screen generative art behind the level-up splash; a random sim each time unless `sim` is given. */
export function GenerativeArt({ color, color2, sim }: { color: string; color2: string; sim?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const frame = SIMS[sim ?? Math.floor(Math.random() * SIMS.length)](w, h, color, color2);
    let t = 0, raf = 0;
    const loop = () => {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.09)'; // fading trails
      ctx.fillRect(0, 0, w, h);
      frame(ctx, w, h, t++);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [color, color2, sim]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// ---------------------------------------------------------------- ambient particles

/** More and livelier particles as you rank up: motes → sparks → god rays at S. */
// Owner's choice (2026-11-01): 40 embers from the start, then a gentle ramp to 80 at S, so the cards stay calm
// (they're translucent, so embers show through them). S rank's real signal is the god rays.
const AMBIENT: Record<Rank, { count: number; speed: number; rays: boolean }> = {
  E: { count: 40, speed: 0.15, rays: false },
  D: { count: 48, speed: 0.18, rays: false },
  C: { count: 56, speed: 0.22, rays: false },
  B: { count: 64, speed: 0.28, rays: false },
  A: { count: 72, speed: 0.34, rays: false },
  S: { count: 80, speed: 0.38, rays: true },
};

export function AmbientParticles({ rank }: { rank: Rank }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext('2d')!;
    const cfg = AMBIENT[rank];
    const { main, glow } = RANK_COLORS[rank];
    let w = 0, h = 0, raf = 0, t = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const ps = Array.from({ length: cfg.count }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 2.2), v: rand(0.5, 1.5) * cfg.speed, ph: rand(0, 6.3), c: Math.random() < 0.5 ? main : glow }));
    const loop = () => {
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h);
        if (cfg.rays) {
          // Slowly turning god rays from the top of the screen
          for (let k = 0; k < 3; k++) {
            const a = Math.sin(t * 0.002 + k * 2) * 0.35 + Math.PI / 2;
            const g = ctx.createLinearGradient(w / 2, -40, w / 2 + Math.cos(a) * h, Math.sin(a) * h);
            g.addColorStop(0, `${main}22`); g.addColorStop(1, `${main}00`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(w / 2 - 30, -40); ctx.lineTo(w / 2 + Math.cos(a - 0.12) * h * 1.4, Math.sin(a - 0.12) * h * 1.4);
            ctx.lineTo(w / 2 + Math.cos(a + 0.12) * h * 1.4, Math.sin(a + 0.12) * h * 1.4); ctx.closePath(); ctx.fill();
          }
        }
        for (const p of ps) {
          p.y -= p.v; p.x += Math.sin(t * 0.01 + p.ph) * 0.15;
          if (p.y < -5) { p.y = h + 5; p.x = rand(0, w); }
          ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.02 + p.ph));
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        t++;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [rank]);
  // z-index -1 inside #root's stacking context: above the page background, below all content.
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} />;
}
