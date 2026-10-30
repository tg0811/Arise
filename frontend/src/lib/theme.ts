import type { Rank } from '@shared';

// Warm → cool: E-rank starts in THE-SYSTEM's warm charcoal/coral and each rank
// cools until S-rank lands in LevelUp's deep navy with blue/violet glass.
export interface Palette {
  bg: string;
  panel: string;
  accent: string;
  accent2: string;
  text: string;
  text2: string;
  muted: string;
}

export const PALETTES: Record<Rank, Palette> = {
  E: { bg: '#1a1714', panel: '#26211c', accent: '#d97757', accent2: '#e3b341', text: '#f2ede4', text2: '#b3aa9b', muted: '#7a7266' },
  D: { bg: '#181512', panel: '#25201a', accent: '#e0a050', accent2: '#d97757', text: '#f3eee4', text2: '#b5ab98', muted: '#7d7464' },
  C: { bg: '#131516', panel: '#1d2224', accent: '#5fbf9a', accent2: '#e0a050', text: '#eef2ee', text2: '#a5b0aa', muted: '#6c7772' },
  B: { bg: '#0d1419', panel: '#162129', accent: '#22b8cf', accent2: '#5fbf9a', text: '#ecf4f7', text2: '#9fb2bb', muted: '#647984' },
  A: { bg: '#090f1d', panel: '#121b30', accent: '#3b82f6', accent2: '#22b8cf', text: '#f1f5fb', text2: '#9aabc4', muted: '#5f7090' },
  S: { bg: '#020617', panel: '#0f172a', accent: '#8b5cf6', accent2: '#3b82f6', text: '#f8fafc', text2: '#94a3b8', muted: '#5b6b85' },
};

export function applyTheme(rank: Rank) {
  const p = PALETTES[rank];
  const s = document.documentElement.style;
  s.setProperty('--sl-bg', p.bg);
  s.setProperty('--sl-panel', p.panel);
  s.setProperty('--sl-accent', p.accent);
  s.setProperty('--sl-accent2', p.accent2);
  s.setProperty('--sl-text', p.text);
  s.setProperty('--sl-text2', p.text2);
  s.setProperty('--sl-muted', p.muted);
  s.setProperty('--sl-line', `color-mix(in srgb, ${p.accent} 18%, transparent)`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}

export const DIFFICULTY_STYLE: Record<string, { label: string; color: string }> = {
  easy: { label: 'Easy', color: '#9ca77f' },
  normal: { label: 'Normal', color: '#d2a24c' },
  hard: { label: 'Hard', color: '#d97757' },
  legendary: { label: 'Legendary', color: '#c0506b' },
};
