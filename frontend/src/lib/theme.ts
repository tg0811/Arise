import type { Rank } from '@shared';

// Two colour layers:
//  - The System: one fixed Solo Leveling / LevelUp blue for all chrome (defaults in index.css).
//  - Your rank: a warm → cool colour used ONLY on rank elements (badge, title, avatar aura,
//    rank-up splash, rank ladder). E starts as an ember; S is shadow-monarch violet.

export const RANK_COLORS: Record<Rank, { main: string; glow: string }> = {
  E: { main: '#d97757', glow: '#f0a07e' },
  D: { main: '#e0a050', glow: '#f5c27a' },
  C: { main: '#34d399', glow: '#6ee7b7' },
  B: { main: '#22d3ee', glow: '#67e8f9' },
  A: { main: '#60a5fa', glow: '#93c5fd' },
  S: { main: '#a78bfa', glow: '#c4b5fd' },
};

export const rankColor = (rank: Rank) => RANK_COLORS[rank].main;

/** Point the rank variables at the current rank; the System palette never changes. */
export function applyTheme(rank: Rank) {
  const s = document.documentElement.style;
  s.setProperty('--sl-rank', RANK_COLORS[rank].main);
  s.setProperty('--sl-rank-glow', RANK_COLORS[rank].glow);
}

export const DIFFICULTY_STYLE: Record<string, { label: string; color: string }> = {
  easy: { label: 'Easy', color: '#9ca77f' },
  normal: { label: 'Normal', color: '#d2a24c' },
  hard: { label: 'Hard', color: '#d97757' },
  legendary: { label: 'Legendary', color: '#c0506b' },
};
