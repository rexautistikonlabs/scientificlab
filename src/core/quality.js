/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Quality tiers and adaptive quality control.

   The profile of this application is unusual and it dictates the whole
   strategy. It is not geometry-bound (~160 k triangles) and it is not
   CPU-bound (the solver, physiology, afferent model, scale manager and
   tools together cost well under half a millisecond a frame). It is
   fragment-bound: a dozen translucent shells overlap at every pixel of
   the figure, and each of those fragments runs a three-light rig.

   So the levers that matter, in order of measured effect:

     1. how many pixels are shaded        → render scale
     2. how many of them survive          → translucent-shell alpha cut
     3. how expensive each one is         → specular-free lighting path
     4. how many extra fullscreen passes  → MSAA samples, bloom levels
     5. how many small additive sprites   → particle and instance density

   Every one of those is a runtime uniform, a render-target size or a
   draw range, so a tier change takes effect on the next frame without
   rebuilding anything. The single exception is geometry tessellation,
   which is baked at load time — see `geometry` below.
   ============================================================ */

import { clamp } from './util.js';

/** Coarse → fine. Auto walks this ladder. */
export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

/**
 * Tier table.
 *
 * `dpr` / `dprFloor` bound the render scale: Auto moves within the band and
 * only changes tier once it has run out of band. `bloom` and `alphaCut` are the
 * two knobs that visibly change the look, and both were chosen so the scientific
 * reading of the image survives: the alpha cut thins the interior of translucent
 * shells in proportion to their own opacity, leaving the fresnel-weighted rim
 * that carries the anatomy, and never touching dense or thin-ribbon layers.
 */
export const TIERS = {
  low: {
    id: 'low',
    name: 'Low',
    short: 'LOW',
    blurb: 'Integrated graphics and older laptops. Rim-weighted translucency, no bloom, no MSAA, no specular.',
    /* Deliberately a higher render scale than the tier above it might suggest.
       Turning 4× MSAA off measured a 48 % saving while dropping the render scale
       from 1.0 to 0.75 measured 21 %, so on a bandwidth-bound machine —
       integrated graphics being exactly that — spending the MSAA budget on
       resolution instead buys a sharper image for less. Supersampling is the
       poorer deal only where MSAA has dedicated hardware behind it, which is
       precisely the hardware that does not need this tier. */
    dpr: 0.9,
    dprFloor: 0.5,
    msaa: 0,
    bloomLevels: 0,
    bloom: 0,
    chroma: 0,
    grain: 0.004,
    particles: 0.28,
    receptors: 0.34,
    /* Discard translucent fragments below this *fraction of the layer's own
       opacity*. At 0.18 a broad envelope shell keeps roughly the outer third of
       its fresnel range — a visible rim band — and loses the flat interior that
       was contributing almost nothing; dense and thin-ribbon layers are never
       affected, because their alpha never falls that low. */
    alphaCut: 0.18,
    cheapLight: 1,
    doubleSide: false,
    /** tessellation, decided at load time */
    geometry: false,
    signalSize: 0.85,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    short: 'MED',
    blurb: 'Recent integrated graphics and mid-range laptops. Full translucency, light bloom.',
    dpr: 1.0,
    dprFloor: 0.62,
    msaa: 2,
    bloomLevels: 1,
    bloom: 0.7,
    chroma: 0.0008,
    grain: 0.005,
    particles: 0.5,
    receptors: 0.6,
    alphaCut: 0.09,
    cheapLight: 0,
    doubleSide: true,
    geometry: true,
    signalSize: 0.94,
  },
  high: {
    id: 'high',
    name: 'High',
    short: 'HIGH',
    blurb: 'Discrete GPUs and Apple silicon. Everything on, two-level bloom, 4× MSAA.',
    dpr: 1.5,
    dprFloor: 0.85,
    msaa: 4,
    bloomLevels: 2,
    bloom: 1,
    chroma: 0.0016,
    grain: 0.005,
    particles: 0.78,
    receptors: 1,
    alphaCut: 0.03,
    cheapLight: 0,
    doubleSide: true,
    geometry: true,
    signalSize: 1,
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    short: 'ULTRA',
    blurb: 'Modern discrete GPUs. Full device resolution and the complete particle field.',
    dpr: 2.0,
    dprFloor: 1.0,
    msaa: 4,
    bloomLevels: 2,
    bloom: 1,
    chroma: 0.0016,
    grain: 0.005,
    particles: 1,
    receptors: 1,
    alphaCut: 0.02,
    cheapLight: 0,
    doubleSide: true,
    geometry: true,
    signalSize: 1,
  },
};

/* ============================================================
   Hardware detection
   ============================================================ */

/** Unmasked GPU string where the browser will give us one. */
function gpuString(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(s || '');
  } catch {
    return '';
  }
}

/**
 * Pick a starting tier. This is a first guess only: Auto measures the real
 * frame time within a couple of seconds and moves from here, so being wrong
 * costs a brief adjustment rather than a bad session. What detection does buy
 * is the load-time tessellation decision, which cannot be revisited.
 */
export function detectHardware(renderer) {
  const gpu = gpuString(renderer);
  const g = gpu.toLowerCase();
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 0; // GiB, Chrome only

  let tier = 'medium';
  let reason = 'unrecognised GPU — starting at Medium and measuring';

  if (!gpu) {
    reason = 'GPU not reported — starting at Medium and measuring';
  } else if (/swiftshader|llvmpipe|softpipe|mesa offscreen|basic render|microsoft basic/.test(g)) {
    tier = 'low';
    reason = 'software rasteriser — no GPU acceleration available';
  } else if (mobile) {
    tier = /apple|adreno 7|adreno 8|mali-g7|mali-g8|immortalis/.test(g) ? 'medium' : 'low';
    reason = 'mobile GPU';
  } else if (/(rtx|radeon rx|arc a|geforce (gtx )?(16|20|30|40|50)\d\d)/.test(g)) {
    tier = 'high';
    reason = 'modern discrete GPU';
  } else if (/apple m\d/.test(g)) {
    tier = 'high';
    reason = 'Apple silicon';
  } else if (/(iris xe|iris plus|radeon (pro )?vega|quadro|radeon pro)/.test(g)) {
    tier = 'medium';
    reason = 'recent integrated or workstation GPU';
  } else if (/(intel|uhd graphics|hd graphics|gma|vivante)/.test(g)) {
    tier = cores >= 8 ? 'medium' : 'low';
    reason = 'Intel integrated graphics';
  } else if (/(geforce|radeon|nvidia|amd)/.test(g)) {
    tier = 'high';
    reason = 'discrete GPU';
  }

  // a weak CPU cannot feed the build either, and tessellation is CPU work
  if (cores <= 2 && tier !== 'low') {
    tier = 'low';
    reason = `${reason} · ${cores} logical cores`;
  }
  if (mem && mem <= 2 && tier !== 'low') {
    tier = 'low';
    reason = `${reason} · ${mem} GB reported`;
  }

  /* Tessellation is the one decision that cannot be revisited at runtime, so it
     is deliberately generous: at ~160 k triangles the model is nowhere near
     vertex-bound on any GPU of the last decade, and coarse silhouettes are the
     one degradation that looks like a bug rather than a setting. Only the
     genuinely weak path builds reduced. */
  const geometry = TIERS[tier].geometry;

  return { tier, reason, gpu, mobile, cores, geometry };
}

/* ============================================================
   Adaptive controller
   ============================================================ */

const DEGRADE_AT = 1 / 44; // sustained frame time worse than this → step down
const UPGRADE_AT = 1 / 57; // sustained frame time better than this → step up
const SETTLE = 1.1; // seconds to ignore after any change
/* …and at least this many frames. On a machine at three frames a second the
   time-based settle expires inside two frames, long before the exponential
   average has caught up with the change we just made — so the controller would
   walk the whole ladder down in a second, reacting to measurements that still
   described the old configuration. Whichever condition is slower governs. */
const SETTLE_FRAMES = 14;
const DEGRADE_HOLD = 0.6; // seconds of sustained slowness before acting
const UPGRADE_HOLD = 2.6; // longer, so we do not oscillate
const RETRY_HOLD = 14; // much longer before retrying a tier that already failed

/** How many decisions to keep for inspection. */
const LOG_LIMIT = 60;

/**
 * Owns the current tier and render scale.
 *
 * In Auto it walks the ladder: lower the render scale first, because that is
 * both the largest lever and the least visible one, and only change tier once
 * the scale band is exhausted. Tiers that have already proved too slow are
 * retried far more reluctantly than they are left, which is what stops the
 * controller from flip-flopping on a machine sitting right at a boundary.
 */
export class QualityController {
  /**
   * @param {object} o
   * @param {object} o.detected  result of detectHardware
   * @param {(tier:object, info:object)=>void} o.onTier   apply a tier
   * @param {(dpr:number)=>void} o.onScale                apply a render scale
   */
  constructor({ detected, onTier, onScale }) {
    this.detected = detected;
    this.onTier = onTier;
    this.onScale = onScale;

    this.mode = 'auto';
    this.index = TIER_ORDER.indexOf(detected.tier);
    if (this.index < 0) this.index = 1;
    this.builtGeometry = detected.geometry;

    this.dpr = this._capFor(this.index);
    this.frameAvg = 1 / 60;
    this.fps = 60;

    this._settle = 1.8; // let the first frames warm caches and shaders
    this._settleN = 30;
    this._slow = 0;
    this._fast = 0;
    this._failed = new Array(TIER_ORDER.length).fill(0);
    this._changes = 0;
    this.lastAction = 'measuring';

    /* Every decision, kept. Auto is the one part of this application whose
       behaviour a tester cannot see by looking at the screen — a tier change and
       a resolution change both just look like "it got better". The log is what
       makes tuning on real hardware a matter of reading rather than guessing. */
    this.decisions = [];
    this.t0 = performance.now();
    this.verbose = false;
    this._record('start', `detected ${detected.tier} — ${detected.reason}`);
  }

  _record(kind, detail) {
    const entry = {
      at: +((performance.now() - this.t0) / 1000).toFixed(2),
      kind,
      tier: this.tierId,
      dpr: +this.dpr.toFixed(2),
      fps: +this.fps.toFixed(1),
      frameMs: +(this.frameAvg * 1000).toFixed(1),
      detail,
    };
    this.decisions.push(entry);
    if (this.decisions.length > LOG_LIMIT) this.decisions.shift();
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.info(
        `[continuum:quality] +${entry.at}s ${kind} → ${entry.tier} @ ${entry.dpr}× · ${entry.fps} fps (${entry.frameMs} ms) · ${detail}`
      );
    }
    return entry;
  }

  /** Turn console tracing on or off at runtime. */
  trace(on = true) {
    this.verbose = !!on;
    return this.verbose;
  }

  /** The decision log as a readable table, for pasting into a bug report. */
  logText() {
    const rows = this.decisions.map(
      (d) =>
        `+${String(d.at).padStart(7)}s  ${d.kind.padEnd(11)} ${d.tier.padEnd(6)} ${String(d.dpr).padEnd(5)}× ` +
        `${String(d.fps).padStart(6)} fps ${String(d.frameMs).padStart(7)} ms  ${d.detail}`
    );
    return ['     time  action      tier   scale     fps   frame   detail', ...rows].join('\n');
  }

  get tierId() {
    return TIER_ORDER[this.index];
  }

  get tier() {
    return TIERS[this.tierId];
  }

  /** True when the user picked a tier the load-time tessellation cannot serve. */
  get geometryShortfall() {
    return !this.builtGeometry && this.tier.geometry;
  }

  _capFor(i) {
    const t = TIERS[TIER_ORDER[i]];
    return Math.min(window.devicePixelRatio || 1, t.dpr);
  }

  /** Apply the current tier and scale through the callbacks. */
  apply(why = 'set') {
    this.lastAction = why;
    this.onTier?.(this.tier, { mode: this.mode, dpr: this.dpr, why });
    this.onScale?.(this.dpr);
  }

  /**
   * @param {'auto'|'low'|'medium'|'high'|'ultra'} mode
   */
  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') {
      const i = TIER_ORDER.indexOf(mode);
      if (i >= 0) this.index = i;
      this.dpr = this._capFor(this.index);
    } else {
      // re-entering Auto starts from where the user left off rather than from
      // the detection guess: they have just told us this tier is acceptable
      this.dpr = this._capFor(this.index);
      this._failed.fill(0);
    }
    this._hold();
    this._record('mode', mode === 'auto' ? 'Auto — measuring' : `locked to ${mode}`);
    this.apply(mode === 'auto' ? 'auto' : 'manual');
  }

  /** Ignore measurements for a while after changing something. */
  _hold(factor = 1) {
    this._settle = SETTLE * factor;
    this._settleN = Math.round(SETTLE_FRAMES * factor);
    this._slow = 0;
    this._fast = 0;
  }

  /** Nudge the resolution band without changing tier. Returns true if it moved. */
  _setDpr(v) {
    const t = this.tier;
    const cap = this._capFor(this.index);
    const next = clamp(v, Math.min(t.dprFloor, cap), cap);
    if (Math.abs(next - this.dpr) < 0.02) return false;
    this.dpr = next;
    this.onScale?.(this.dpr);
    return true;
  }

  /**
   * Call once per frame with the true, unclamped frame time.
   *
   * Only an outright stall is discarded. It is tempting to filter anything
   * "unreasonably" slow as a spike, but that is exactly backwards: a machine
   * genuinely rendering at four frames a second is the case this controller
   * exists for, and treating its frame times as measurement noise would leave
   * it stuck at the tier it cannot run. Single hitches are absorbed instead by
   * the exponential average and the sustained-slowness hold below, which
   * together need roughly half a second of real slowness before acting.
   */
  update(raw) {
    if (!(raw > 0) || raw > 1.5) return; // a discontinuity, not a frame rate
    this.frameAvg = this.frameAvg * 0.9 + raw * 0.1;
    this.fps = 1 / Math.max(1e-4, this.frameAvg);

    if (this._settle > 0 || this._settleN > 0) {
      this._settle -= raw;
      this._settleN--;
      return;
    }
    if (this.mode !== 'auto') return;

    const t = this.tier;
    const cap = this._capFor(this.index);
    const floor = Math.min(t.dprFloor, cap);

    if (this.frameAvg > DEGRADE_AT) {
      this._fast = 0;
      this._slow += raw;
      if (this._slow < DEGRADE_HOLD) return;
      this._slow = 0;
      if (this.dpr > floor + 0.02) {
        this._setDpr(this.dpr - 0.14);
        this._hold();
        this.lastAction = `resolution ${this.dpr.toFixed(2)}×`;
        this._record('scale-down', `slow for ${DEGRADE_HOLD}s → render scale ${this.dpr.toFixed(2)}×`);
      } else if (this.index > 0) {
        this._failed[this.index]++;
        this.index--;
        this.dpr = this._capFor(this.index);
        this._changes++;
        this._hold(1.6);
        this._record('tier-down', `render scale already at floor → ${TIER_ORDER[this.index]}`);
        this.apply('auto-down');
      } else {
        // already at the floor of the lowest tier; stop trying so often
        this._hold(5);
        this.lastAction = 'at minimum';
        this._record('floor', 'lowest tier at lowest render scale — nothing further to give');
      }
      return;
    }

    if (this.frameAvg < UPGRADE_AT) {
      this._slow = 0;
      this._fast += raw;
      const nextIndex = this.index + 1;
      const hold = this._failed[nextIndex] ? RETRY_HOLD : UPGRADE_HOLD;
      if (this.dpr < cap - 0.02) {
        if (this._fast < UPGRADE_HOLD) return;
        this._fast = 0;
        this._setDpr(this.dpr + 0.1);
        this._hold(1.4);
        this.lastAction = `resolution ${this.dpr.toFixed(2)}×`;
        this._record('scale-up', `headroom → render scale ${this.dpr.toFixed(2)}×`);
      } else if (nextIndex < TIER_ORDER.length) {
        if (this._fast < hold) return;
        this._fast = 0;
        this.index = nextIndex;
        this.dpr = Math.min(this._capFor(this.index), Math.max(cap, this.dpr));
        this._changes++;
        this._hold(1.6);
        this._record(
          'tier-up',
          `render scale at cap with headroom → ${TIER_ORDER[this.index]}` +
            (this._failed[this.index] ? ` (retry ${this._failed[this.index]})` : '')
        );
        this.apply('auto-up');
      }
      return;
    }

    // inside the band: this is where we want to sit
    this._slow = Math.max(0, this._slow - raw * 0.5);
    this._fast = Math.max(0, this._fast - raw * 0.5);
  }

  /** Read-out for the performance HUD. */
  stats() {
    return {
      mode: this.mode,
      tier: this.tierId,
      tierName: this.tier.name,
      dpr: this.dpr,
      cap: this._capFor(this.index),
      fps: this.fps,
      frameMs: this.frameAvg * 1000,
      changes: this._changes,
      action: this.lastAction,
      geometry: this.builtGeometry ? 'full' : 'reduced',
      shortfall: this.geometryShortfall,
      gpu: this.detected.gpu,
      reason: this.detected.reason,
    };
  }

  /**
   * Everything a tester should send back with a report.
   *
   * Deliberately one call and one blob: asking someone to read nine numbers off a
   * panel and retype them is how measurements arrive wrong.
   */
  diagnostics(extra = {}) {
    return {
      product: 'CONTINUUM',
      when: new Date().toISOString(),
      hardware: {
        gpu: this.detected.gpu || '(not reported)',
        reason: this.detected.reason,
        cores: this.detected.cores,
        mobile: this.detected.mobile,
        devicePixelRatio: window.devicePixelRatio || 1,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        userAgent: navigator.userAgent,
      },
      quality: {
        mode: this.mode,
        tier: this.tierId,
        renderScale: +this.dpr.toFixed(3),
        renderScaleCap: +this._capFor(this.index).toFixed(3),
        geometry: this.builtGeometry ? 'full' : 'reduced',
        settings: { ...this.tier },
      },
      frame: {
        fps: +this.fps.toFixed(1),
        frameMs: +(this.frameAvg * 1000).toFixed(2),
        changes: this._changes,
      },
      ...extra,
      decisions: this.decisions,
    };
  }
}
