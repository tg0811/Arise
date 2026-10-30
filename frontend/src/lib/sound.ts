// Small synthesized sound effects (Web Audio): no audio files to ship or cache.
// Toggle stored per device; browsers only allow audio after a tap, which every trigger here follows.

const KEY = 'sl-sound';
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: stays on for this session */
  }
}

function audio(): AudioContext | null {
  if (!soundEnabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft bell-like note. */
function note(ac: AudioContext, freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = 'triangle') {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const play = (fn: (ac: AudioContext, t: number) => void) => {
  const ac = audio();
  if (ac) fn(ac, ac.currentTime + 0.02);
};

export const sfx = {
  /** Task done: quick rising two-note blip. */
  complete: () => play((ac, t) => { note(ac, 880, t, 0.18, 0.12); note(ac, 1318.5, t + 0.07, 0.25, 0.1); }),
  /** Task failed: low falling tone. */
  fail: () => play((ac, t) => { note(ac, 220, t, 0.35, 0.14, 'sine'); note(ac, 164.8, t + 0.12, 0.45, 0.12, 'sine'); }),
  /** Level up: bright major arpeggio. */
  levelUp: () => play((ac, t) => [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => note(ac, f, t + i * 0.09, 0.9 - i * 0.08, 0.16))),
  /** Rank up: arpeggio then a held chord. */
  rankUp: () => play((ac, t) => {
    [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => note(ac, f, t + i * 0.1, 0.6, 0.15));
    [523.3, 659.3, 784, 1046.5].forEach((f) => note(ac, f, t + 0.6, 2.2, 0.1, 'sine'));
  }),
  /** Level/rank lost: minor descent. */
  fall: () => play((ac, t) => [440, 349.2, 293.7, 220].forEach((f, i) => note(ac, f, t + i * 0.14, 0.7, 0.14, 'sine'))),
  /** Payload opened: sparkle. */
  loot: () => play((ac, t) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(ac, f, t + i * 0.05, 0.4, 0.08))),
};
