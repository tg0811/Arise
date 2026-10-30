import type { Rank } from '@shared';

// The profile picture framed by an aura that evolves with rank
// (THE-SYSTEM's star evolution, applied to your own face):
// E dim · D halo · C ring · B one mote · A spinning motes · S corona.
const FX: Record<Rank, { halo: boolean; ring: boolean; motes: number; spin: boolean; corona: boolean; opacity: number }> = {
  E: { halo: false, ring: false, motes: 0, spin: false, corona: false, opacity: 0.75 },
  D: { halo: true, ring: false, motes: 0, spin: false, corona: false, opacity: 0.85 },
  C: { halo: true, ring: true, motes: 0, spin: false, corona: false, opacity: 0.92 },
  B: { halo: true, ring: true, motes: 1, spin: false, corona: false, opacity: 1 },
  A: { halo: true, ring: true, motes: 2, spin: true, corona: false, opacity: 1 },
  S: { halo: true, ring: true, motes: 3, spin: true, corona: true, opacity: 1 },
};

export function Avatar({ src, name, rank, size = 56, level }: { src: string | null; name: string; rank: Rank; size?: number; level?: number }) {
  const fx = FX[rank];
  const pad = size * 0.22;
  const outer = size + pad * 2;
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }}>
      {fx.corona && (
        <div className="spin-slow absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, var(--sl-accent), transparent 20%, var(--sl-accent2) 40%, transparent 60%, var(--sl-accent) 80%, transparent)', filter: 'blur(6px)', opacity: 0.8 }} />
      )}
      {fx.halo && (
        <div className="pulse-glow absolute rounded-full"
          style={{ inset: pad * 0.4, background: 'radial-gradient(circle, color-mix(in srgb, var(--sl-accent) 55%, transparent), transparent 70%)' }} />
      )}
      {fx.ring && (
        <div className="absolute rounded-full border-2" style={{ inset: pad * 0.55, borderColor: 'color-mix(in srgb, var(--sl-accent2) 70%, transparent)' }} />
      )}
      {fx.motes > 0 && (
        <div className={`absolute inset-0 ${fx.spin ? 'spin-slow' : ''}`}>
          {Array.from({ length: fx.motes }).map((_, i) => {
            const a = (i / fx.motes) * Math.PI * 2 - Math.PI / 2;
            const r = outer / 2 - 3;
            return (
              <span key={i} className="absolute h-1.5 w-1.5 rounded-full"
                style={{ left: outer / 2 + Math.cos(a) * r - 3, top: outer / 2 + Math.sin(a) * r - 3, background: 'var(--sl-accent2)', boxShadow: '0 0 8px var(--sl-accent2)' }} />
            );
          })}
        </div>
      )}
      <div className="absolute overflow-hidden rounded-full border-2 border-bg bg-panel"
        style={{ inset: pad, opacity: fx.opacity, boxShadow: '0 0 0 2px color-mix(in srgb, var(--sl-accent) 70%, transparent)' }}>
        {src ? (
          <img src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display font-bold text-accent" style={{ fontSize: size * 0.36 }}>{initials}</div>
        )}
      </div>
      {level !== undefined && (
        <span className="absolute bottom-0 right-0 rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-black text-white shadow-lg"
          style={{ background: 'linear-gradient(90deg, var(--sl-accent), var(--sl-accent2))' }}>
          LV {level}
        </span>
      )}
    </div>
  );
}

/** Shrink a picked photo to a small square JPEG data URL before upload. */
export async function resizeImage(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}
