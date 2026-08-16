/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Extended spindle drive — history, force/yank-style, fusimotor.

   ── WHAT THIS IS ───────────────────────────────────────────────
   A deliberately simplified, educational model, inspired by:

     Blum KP, Horslen MG, Ting LH, et al. (2020) Diverse and complex
     muscle spindle afferent firing properties emerge from multiscale
     muscle mechanics. eLife 9:e55177. doi:10.7554/eLife.55177

   ── WHAT THIS IS NOT ───────────────────────────────────────────
   Not a reproduction of that work, not a port of its code, and not
   validated against its figures or against any recording. No code,
   figure or extended text from the paper has been used. The equations
   below were written for this product; what is taken from the paper is
   the *idea* of three phenomena worth showing:

     1. that a Ia afferent's drive tracks intrafusal force and the rate
        of change of that force, rather than muscle length and velocity;
     2. that a recent stretch leaves the receptor less responsive to the
        next one, recovering over seconds;
     3. that fusimotor drive changes what the ending reports.

   Any quantitative agreement with the paper would be a coincidence and
   is not claimed anywhere in this product.

   ── THE MODEL ──────────────────────────────────────────────────
   Two mechanical elements in parallel, both driven by the same length:

     passive        T_pe  = k_pe · [x]₊ + b_if · v
     short-range    T_srs = k_srs · a · s

   `s` is the deflection of the short-range bond, clipped to ±x_y: while
   the bond holds it stretches with the muscle, and past x_y it slides
   and stops contributing more. That clip is what makes the onset of a
   stretch far more forceful than its continuation.

   `a` ∈ [0,1] is cross-bridge availability, and it is where the history
   lives:

     da/dt = (1 − a)/τ_rec  −  a · |v| / x_slip

   Recovery is first-order in *time*; breakdown is first-order in
   *distance travelled*. So sitting still restores the receptor over
   seconds while moving depletes it in millimetres, and a second stretch
   arriving before recovery finds fewer bonds to break.

   Drive is then tension and its own derivative — yank:

     Y = dT/dt   (low-passed; differentiating a frame-sampled signal
                  otherwise reports the sampling, not the receptor)

     r = r₀ + g_T · [T]₊ + g_Y · [Y]₊^p_y

   ── TWO CHANNELS ───────────────────────────────────────────────
   The same equations run twice with different emphasis — a bag-like
   channel weighted toward yank and a chain-like channel weighted toward
   tension — and are combined by a single occlusion rule:

     r = max(r_bag, r_chain) + k_occ · min(r_bag, r_chain)

   At k_occ = 0 the louder channel takes the axon outright, which is the
   classic occlusion observation; at 1 they simply sum. This is schematic:
   one number stands in for a real afferent's branching.

   Every constant is read from data/micro/literature_params.js. There are
   no naked numbers in this file, by the same rule as the rest of the
   micro code.
   ============================================================ */

import { P } from '../data/micro/literature_params.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ============================================================
   Pure step functions — no object state, unit-testable
   ============================================================ */

/**
 * One step of cross-bridge availability.
 *
 * @param {number} a       current availability, 0..1
 * @param {number} v_mms   lengthening velocity, mm/s (sign ignored — travel is travel)
 * @param {number} dt      seconds
 * @param {number} [tau]   recovery time constant, s
 * @param {number} [xSlip] travel that depletes availability by ~1/e, mm
 * @returns {number} availability after the step
 */
export function stepAvailability(a, v_mms, dt, tau = P('srsRecoveryTau'), xSlip = P('srsSlipDistance')) {
  const travel = Math.abs(v_mms) * dt;
  // recovery: exact for the first-order term, so a long dt is still correct
  const recovered = 1 - (1 - a) * Math.exp(-dt / Math.max(1e-4, tau));
  // breakdown: exponential in distance moved, not in time
  return clamp01(recovered * Math.exp(-travel / Math.max(1e-6, xSlip)));
}

/**
 * One step of short-range bond deflection.
 * Grows with the muscle while the bond holds; clipped at the yield point,
 * beyond which the element slides instead of pulling harder.
 */
export function stepBondDeflection(s, v_mms, dt, xYield = P('srsYieldDisplacement')) {
  const next = s + v_mms * dt;
  return next > xYield ? xYield : next < -xYield ? -xYield : next;
}

/**
 * Intrafusal tension proxy, arbitrary units.
 *
 * @param {number} x_mm     length change from reference (+ = stretched)
 * @param {number} v_mms    lengthening velocity
 * @param {number} a        cross-bridge availability
 * @param {number} s        bond deflection
 * @param {number} [srsScale] multiplier on short-range stiffness (dynamic fusimotor)
 */
export function intrafusalTension(x_mm, v_mms, a, s, srsScale = 1) {
  const passive = P('passiveStiffness') * Math.max(0, x_mm) + P('intrafusalDamping') * v_mms;
  const shortRange = P('srsGain') * srsScale * a * s;
  return passive + shortRange;
}

/**
 * Firing rate from tension and yank.
 *
 * @param {number} T        tension proxy
 * @param {number} Y        yank, d(tension)/dt
 * @param {object} [g]      channel gains and bias
 */
export function rateFromTensionYank(T, Y, g = {}) {
  const gT = g.tension ?? P('tensionGain');
  const gY = g.yank ?? P('yankGain');
  const r0 = g.bias ?? P('iaRateBias');
  const py = P('yankExponent');
  const yankTerm = Y > 0 ? gY * Math.pow(Y, py) : 0;
  const r = r0 + gT * Math.max(0, T) + yankTerm;
  return Math.min(P('iaMaxRate'), Math.max(0, r));
}

/**
 * Combine the two channels.
 * k_occ = 0 → winner takes the axon; 1 → simple sum.
 */
export function occlude(rBag, rChain, k = P('occlusionFactor')) {
  const hi = Math.max(rBag, rChain);
  const lo = Math.min(rBag, rChain);
  return Math.min(P('iaMaxRate'), hi + k * lo);
}

/* ============================================================
   Stateful drive
   ============================================================ */

/**
 * The Extended drive for one ending.
 *
 * Holds the mechanical history — availability, bond deflection, previous
 * tension — and turns a length trajectory into a firing rate. It knows nothing
 * about spikes, conduction or geometry; SpindleUnit owns those and is unchanged
 * by which drive is feeding it.
 */
export class ExtendedDrive {
  constructor() {
    this.reset();
  }

  reset() {
    /** cross-bridge availability, 0..1 — 1 is fully rested */
    this.availability = 1;
    /** short-range bond deflection, mm */
    this.bond = 0;
    /** tension proxy and its low-passed derivative */
    this.tension = 0;
    this.yank = 0;
    this._prevTension = 0;
    this.rate = 0;
    this.rateBag = 0;
    this.rateChain = 0;
  }

  /**
   * Advance one substep.
   *
   * @param {number} x_mm    length change from reference
   * @param {number} v_mms   lengthening velocity
   * @param {number} dt      seconds
   * @param {object} gamma   { static: 0..1, dynamic: 0..1 }
   * @returns {number} firing rate, spikes/s
   */
  step(x_mm, v_mms, dt, gamma = { static: 0, dynamic: 0 }) {
    if (!(dt > 0)) return this.rate;

    const gStat = clamp01(gamma.static ?? 0);
    const gDyn = clamp01(gamma.dynamic ?? 0);

    /* Dynamic fusimotor drive stiffens the short-range element — that is the
       mechanical route by which it sharpens the response to a stretch's onset
       rather than simply adding rate on top. Deliberately at half weight
       compared with its effect on yank sensitivity: stiffening the short-range
       element also raises the held tension, and at full weight that made
       "dynamic" drive lift the plateau almost as much as static drive did,
       which is precisely the distinction the two channels exist to draw. */
    const srsScale = 1 + 0.5 * P('gammaDynamicGain') * gDyn;

    this.availability = stepAvailability(this.availability, v_mms, dt);
    this.bond = stepBondDeflection(this.bond, v_mms, dt);

    const T = intrafusalTension(x_mm, v_mms, this.availability, this.bond, srsScale);

    /* Yank, low-passed. The raw difference quotient of a signal that is only
       known once per frame is dominated by the sampling. */
    const rawYank = (T - this._prevTension) / dt;
    const k = 1 - Math.exp(-dt / Math.max(1e-4, P('yankTau')));
    this.yank += (rawYank - this.yank) * k;
    this._prevTension = T;
    this.tension = T;

    /* Two channels from the same mechanics, differing in emphasis. The bag-like
       one is weighted toward yank, the chain-like one toward sustained tension;
       static fusimotor drive raises the chain channel's bias and gain, dynamic
       drive raises the bag channel's yank sensitivity. */
    const wChain = P('chainChannelShare');
    const wBag = 1 - wChain;
    const statGain = 1 + P('gammaStaticGain') * gStat;

    this.rateBag = rateFromTensionYank(T, this.yank, {
      tension: P('tensionGain') * wBag * 0.6,
      yank: P('yankGain') * (1 + P('gammaDynamicGain') * gDyn),
      bias: P('iaRateBias') * wBag,
    });

    this.rateChain = rateFromTensionYank(T, this.yank, {
      tension: P('tensionGain') * wChain * statGain,
      yank: P('yankGain') * wChain * 0.25,
      bias: P('iaRateBias') * wChain + P('gammaStaticBias') * gStat,
    });

    this.rate = occlude(this.rateBag, this.rateChain);
    return this.rate;
  }

  readout() {
    return {
      tension: +this.tension.toFixed(4),
      yank: +this.yank.toFixed(3),
      availability: +this.availability.toFixed(4),
      bondMm: +this.bond.toFixed(5),
      rateBagHz: +this.rateBag.toFixed(1),
      rateChainHz: +this.rateChain.toFixed(1),
    };
  }
}

/* ============================================================
   Length protocols
   ============================================================ */

/**
 * Scenario presets.
 *
 * `cervical` is the product's own working range — the sub-millimetre excursion
 * the deep dorsal neck ROI actually produces under breathing. The others are
 * teaching scenarios at multi-millimetre amplitudes, which is where history and
 * yank effects are large enough to see plainly.
 *
 * The amplitudes matter more than they look. At the Basic model's length gain
 * of 200 spikes/s per mm, a three-millimetre ramp pins the rate at r_max for the
 * whole stretch and the dynamic response vanishes into the ceiling — the
 * measurement becomes a measurement of the clamp. Extended gains are set an
 * order of magnitude lower for exactly this reason, so a multi-millimetre
 * scenario stays inside the working range instead of saturating.
 */
export const PROTOCOLS = {
  cervical: {
    id: 'cervical',
    name: 'Cervical ROI (product scale)',
    blurb: 'The sub-millimetre excursion this ROI actually sees. Effects are small because the movement is small.',
    amplitudeMm: 0.25,
    rampMs: 300,
    holdMs: 1200,
    returnMs: 400,
  },
  rampHold: {
    id: 'rampHold',
    name: 'Ramp–hold–release',
    blurb: 'A single stretch, held, then released. The classic shape: burst on the ramp, decay to a plateau.',
    amplitudeMm: 2.0,
    rampMs: 400,
    holdMs: 1500,
    returnMs: 400,
  },
  history: {
    id: 'history',
    name: 'History pair',
    blurb: 'Two identical stretches. Change the gap and watch the second one change with it.',
    amplitudeMm: 2.0,
    rampMs: 300,
    holdMs: 600,
    returnMs: 300,
    repeat: 2,
    gapS: 0.5,
  },
  fastSlow: {
    id: 'fastSlow',
    name: 'Fast vs slow ramp',
    blurb: 'Same distance, different speed. Only a drive that sees yank tells them apart.',
    amplitudeMm: 2.0,
    rampMs: 120,
    holdMs: 1200,
    returnMs: 400,
  },

  /* ---- literature-shaped presets ----
     "Literature protocol" here means the *shape* of a classic stretch protocol,
     nothing more. There is no scored comparison against any published series,
     because this product holds no published series to compare against. A
     preset that reported a fidelity percentage would be inventing a number. */
  passiveRHR: {
    id: 'passiveRHR',
    name: 'Passive ramp–hold–release (educational)',
    blurb: 'A small ramp–hold–release sized to stay inside the Basic drive’s working range. The safe starting point.',
    amplitudeMm: 0.4,
    rampMs: 350,
    holdMs: 1400,
    returnMs: 350,
    expected: 'Burst during the ramp, decay to a lower held plateau, silence on release.',
    safeFor: ['basic', 'extended'],
  },
  blumShaped: {
    id: 'blumShaped',
    name: 'Blum-shaped RHR (3 mm)',
    blurb:
      'A multi-millimetre ramp–hold–release of the shape used in the stretch literature. Educational amplitude, not ' +
      'taken from any figure. Saturates the Basic drive — use Extended.',
    amplitudeMm: 3.0,
    rampMs: 400,
    holdMs: 1500,
    returnMs: 400,
    expected: 'Large burst on the ramp, marked decay to plateau, dynamic index well above one.',
    safeFor: ['extended'],
    warn:
      'This ROI’s real excursion is a fraction of a millimetre. At 3 mm the Basic drive pins at its ceiling and the ' +
      'dynamic response disappears into the clamp.',
  },
  velocitySeries: {
    id: 'velocitySeries',
    name: 'Velocity series',
    blurb: 'Same amplitude at three speeds. Run it three times, changing only the ramp.',
    amplitudeMm: 2.0,
    rampMs: 400,
    holdMs: 1200,
    returnMs: 400,
    series: [1000, 400, 150],
    expected: 'Early burst grows with ramp speed; the held plateau barely moves.',
    safeFor: ['extended'],
  },
};

/**
 * Length at time t for a protocol, in mm from reference.
 *
 * Piecewise linear ramp–hold–release, optionally repeated after a gap. Linear
 * on purpose: a smoothed ramp would blur the onset, and the onset is the part
 * the Extended model exists to show.
 */
export function protocolLength(spec, t) {
  const ramp = spec.rampMs / 1000;
  const hold = spec.holdMs / 1000;
  const back = spec.returnMs / 1000;
  const gap = spec.gapS ?? 0;
  const cycle = ramp + hold + back + gap;
  const reps = spec.repeat ?? 1;
  if (t < 0) return 0;
  if (t >= cycle * reps) return 0;
  const local = t % cycle;
  const A = spec.amplitudeMm;
  if (local < ramp) return (A * local) / ramp;
  if (local < ramp + hold) return A;
  if (local < ramp + hold + back) return A * (1 - (local - ramp - hold) / back);
  return 0;
}

/** Total duration of a protocol, seconds. */
export function protocolDuration(spec) {
  const cycle = (spec.rampMs + spec.holdMs + spec.returnMs) / 1000 + (spec.gapS ?? 0);
  return cycle * (spec.repeat ?? 1);
}

/* ============================================================
   Offline runner
   ============================================================ */

/**
 * Run a protocol through the Extended drive and return the trace.
 *
 * This is the same code the interactive scenario runs, exposed as a pure
 * function so a test can drive it without a browser, a body, or a breath — the
 * history test in particular needs a length trajectory that is exactly what it
 * says it is, and the living model is never exactly anything twice.
 *
 * @param {object} spec        protocol, as in PROTOCOLS
 * @param {object} [opts]
 * @param {number} [opts.dt]   integration step, s
 * @param {number} [opts.settle] quiet seconds before the protocol, to rest the tissue
 * @param {object} [opts.gamma]
 * @returns {{t:number[], x:number[], v:number[], rate:number[], tension:number[], yank:number[], availability:number[]}}
 */
export function simulateProtocol(spec, opts = {}) {
  const dt = opts.dt ?? 1 / 1000;
  const settle = opts.settle ?? 3;
  const gamma = opts.gamma ?? { static: 0, dynamic: 0 };
  const drive = opts.drive ?? new ExtendedDrive();
  const dur = protocolDuration(spec);

  const out = { t: [], x: [], v: [], rate: [], tension: [], yank: [], availability: [] };

  // rest first, so every run starts from the same fully recovered state
  const nSettle = Math.round(settle / dt);
  for (let i = 0; i < nSettle; i++) drive.step(0, 0, dt, gamma);

  const n = Math.round(dur / dt);
  let prevX = protocolLength(spec, 0);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const x = protocolLength(spec, t);
    const v = (x - prevX) / dt;
    prevX = x;
    const r = drive.step(x, v, dt, gamma);
    out.t.push(t);
    out.x.push(x);
    out.v.push(v);
    out.rate.push(r);
    out.tension.push(drive.tension);
    out.yank.push(drive.yank);
    out.availability.push(drive.availability);
  }
  return out;
}

/**
 * Peak rate within each repetition of a protocol.
 * Used by the history test: the ratio of the second peak to the first is the
 * whole measurement.
 */
export function peaksPerRepetition(spec, trace) {
  const cycle = (spec.rampMs + spec.holdMs + spec.returnMs) / 1000 + (spec.gapS ?? 0);
  const reps = spec.repeat ?? 1;
  const peaks = new Array(reps).fill(0);
  for (let i = 0; i < trace.t.length; i++) {
    const k = Math.min(reps - 1, Math.floor(trace.t[i] / cycle));
    if (trace.rate[i] > peaks[k]) peaks[k] = trace.rate[i];
  }
  return peaks;
}
