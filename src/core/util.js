/* ============================================================
   Small math / helper library shared across the simulation.
   ============================================================ */

export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const mix = lerp;

export const smoothstep = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

/** Frame-rate independent exponential approach. `rate` = fraction closed per second. */
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Deterministic 32-bit hash → [0,1). Used everywhere instead of Math.random so the
 *  model is byte-identical on every load (important for a teaching instrument). */
export function hash11(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

/** Seeded generator with a stable, portable sequence (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1-D value noise with smooth interpolation — cheap, deterministic, seamless enough. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash11((i + seed * 7919) | 0);
  const b = hash11((i + 1 + seed * 7919) | 0);
  return lerp(a, b, u) * 2 - 1;
}

/** Layered value noise, output roughly in [-1,1]. */
export function fbm1(x, octaves = 3, seed = 0) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += noise1(x * f, seed + i) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / (norm || 1);
}

/** Format a length in metres with an appropriate SI prefix. */
export function formatLength(m) {
  const a = Math.abs(m);
  if (a >= 1) return `${m.toFixed(a >= 10 ? 0 : 2)} m`;
  if (a >= 0.01) return `${(m * 100).toFixed(a >= 0.1 ? 1 : 2)} cm`;
  if (a >= 1e-3) return `${(m * 1000).toFixed(a >= 0.01 ? 0 : 1)} mm`;
  if (a >= 1e-6) return `${(m * 1e6).toFixed(a >= 1e-5 ? 0 : 1)} µm`;
  return `${(m * 1e9).toFixed(0)} nm`;
}

/** Pick a "nice" round number ≤ v (1, 2, 5 × 10^n). */
export function niceRound(v) {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / e;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
}

/** Running statistics over a fixed window — used by the meters and traces. */
export class Ring {
  constructor(n) {
    this.n = n;
    this.buf = new Float32Array(n);
    this.i = 0;
    this.filled = 0;
  }
  push(v) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.n;
    if (this.filled < this.n) this.filled++;
    return v;
  }
  /** value `k` samples back from the newest (0 = newest). */
  at(k) {
    return this.buf[(this.i - 1 - k + this.n * 2) % this.n];
  }
  mean() {
    if (!this.filled) return 0;
    let s = 0;
    for (let k = 0; k < this.filled; k++) s += this.buf[k];
    return s / this.filled;
  }
  rms() {
    if (!this.filled) return 0;
    let s = 0;
    for (let k = 0; k < this.filled; k++) s += this.buf[k] * this.buf[k];
    return Math.sqrt(s / this.filled);
  }
  minmax() {
    if (!this.filled) return [0, 0];
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < this.filled; k++) {
      const v = this.buf[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }
}

/** First-order low-pass; `tau` in seconds. Models the viscous half of a tissue. */
export class LowPass {
  constructor(tau = 0.05, v = 0) {
    this.tau = tau;
    this.v = v;
  }
  step(x, dt) {
    const a = 1 - Math.exp(-dt / Math.max(1e-5, this.tau));
    this.v += (x - this.v) * a;
    return this.v;
  }
}

/** First-order high-pass — the rate-sensitive (phasic) half of a receptor. */
export class HighPass {
  constructor(tau = 0.02) {
    this.lp = new LowPass(tau);
  }
  step(x, dt) {
    return x - this.lp.step(x, dt);
  }
}

/** Tiny event emitter. */
export class Emitter {
  constructor() {
    this._m = new Map();
  }
  on(k, fn) {
    if (!this._m.has(k)) this._m.set(k, new Set());
    this._m.get(k).add(fn);
    return () => this.off(k, fn);
  }
  off(k, fn) {
    this._m.get(k)?.delete(fn);
  }
  emit(k, payload) {
    const s = this._m.get(k);
    if (!s) return;
    for (const fn of [...s]) fn(payload);
  }
}

/** Convert #rrggbb → [r,g,b] in 0..1. */
export function hexRGB(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const el = (sel, root = document) => root.querySelector(sel);

export function make(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
