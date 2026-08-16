/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Muscle spindle → group Ia afferent → spike train → conduction.

   This is the micro-mechanics pipeline, and it is deliberately more
   physical than the whole-body afferent model in `afferent.js`. That
   model works in normalised load units across seven populations at
   once, which is the right resolution for a telemetry strip. This one
   works in millimetres and milliseconds for a single ending, because
   at microscope scale the thing being shown *is* the timing.

   The chain, in order:

     1. KINEMATICS   L(t) in metres, read straight from the solved
                     network element the spindle lies in parallel with.
                     ΔL and dL/dt follow by difference against the
                     element's anatomical rest length.

     2. RATE         a Prochazka-style primary-ending model:

                       r = r₀ + k_v · [v]₊^p + k_L · a(t) · ΔL

                     with [v]₊ meaning lengthening velocity only — the
                     fractional power on velocity is what produces the
                     classic asymmetry, a burst on stretch and near
                     silence on release. a(t) is slow adaptation of the
                     static term only; velocity sensitivity does not
                     adapt.

     3. SPIKES       exact integrate-and-fire on that rate. Phase
                     accumulates at r·dt and emits when it crosses 1, so
                     the inter-spike interval is exactly 1/r. Nothing
                     here is random: the same mechanical input always
                     produces the same spike times.

     4. CONDUCTION   each spike is stamped with an arrival time
                     t + ℓ/v_c + t_syn. Changing either the path length
                     or the conduction velocity visibly moves when the
                     pulse lands.

   Every constant comes from `data/micro/literature_params.js`. There
   are no magic numbers in this file, and there should never be.

   Integrated at a fixed substep so spike timing is a property of the
   model rather than of the frame rate: at 15 fps and at 144 fps the
   same stretch produces the same number of spikes at the same times.
   ============================================================ */

import { P } from '../data/micro/literature_params.js';
import { ExtendedDrive, protocolLength, protocolDuration } from './spindle_extended.js';

/** Fixed integration step for the spike generator, seconds. */
export const SPIKE_DT = 1 / 1000;
/** Never integrate more than this many substeps in one frame. */
const MAX_SUBSTEPS = 64;
/** How many recent spikes to keep in flight / for the raster. */
const SPIKE_RING = 96;

/**
 * Slow-motion factor applied to the *drawn* flight of a pulse along the axon.
 *
 * A group Ia conduction delay over a fifth of a metre is around three
 * milliseconds. Drawn at real time that is a fraction of one frame: the pulse
 * would exist, be correct, and never be seen. So the flight is stretched by this
 * constant for display, exactly as the whole-body view exaggerates millimetre
 * displacement and the capsule exaggerates percent strain.
 *
 * What this does *not* do: it does not touch the spike times, the rate, the
 * emission phase, or the delay figure in the read-out — those are the model's
 * output and stay in real units. It scales only the mapping from elapsed time
 * to position along the drawn axon, so the *ratio* of two delays is preserved:
 * doubling the path length still doubles the visible flight.
 *
 * The panel states the factor rather than hiding it.
 */
export const PULSE_TIME_DILATION = 120;

/* ============================================================
   Pure functions — no state, unit-testable
   ============================================================ */

/**
 * Primary (Ia) ending firing rate.
 *
 * @param {number} dL_mm      length change from reference, mm (+ = stretched)
 * @param {number} v_mms      lengthening velocity, mm/s (+ = lengthening)
 * @param {number} adapt      adaptation multiplier on the static term, 0..1
 * @param {object} [p]        parameter overrides, for tests
 * @returns {number} spikes/s, ≥ 0 and ≤ r_max
 */
export function iaRate(dL_mm, v_mms, adapt = 1, p = null) {
  const r0 = p?.bias ?? P('iaRateBias');
  const kv = p?.velocityGain ?? P('iaVelocityGain');
  const exp = p?.velocityExponent ?? P('iaVelocityExponent');
  const kL = p?.lengthGain ?? P('iaLengthGain');
  const rMax = p?.maxRate ?? P('iaMaxRate');

  // lengthening only — shortening does not drive the primary ending
  const vPos = v_mms > 0 ? Math.pow(v_mms, exp) : 0;
  const r = r0 + kv * vPos + kL * adapt * dL_mm;
  return Math.min(rMax, Math.max(0, r));
}

/**
 * Conduction delay from the ending to the first central synapse, seconds.
 *
 * @param {number} [pathLength_m]
 * @param {number} [velocity_ms]
 */
export function conductionDelay(pathLength_m = P('iaPathLength'), velocity_ms = P('iaConductionVelocity')) {
  const v = Math.max(1e-3, velocity_ms);
  return pathLength_m / v + P('synapticDelay');
}

/**
 * One step of the slow adaptation state.
 * Relaxes toward the adapted floor while a stretch is held, and recovers
 * toward 1 when the muscle returns to its reference length.
 */
export function stepAdaptation(a, dL_mm, dt, tau = P('iaAdaptationTau'), floor = P('iaAdaptationFloor')) {
  // held stretch drives adaptation; slack lets it recover
  const target = dL_mm > 1e-4 ? floor : 1;
  const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return a + (target - a) * k;
}

/* ============================================================
   Stateful unit
   ============================================================ */

/**
 * One spindle in one network element.
 *
 * The element is chosen at build time by node-pair name so the ROI cannot
 * silently move when the network is edited: if the pair stops existing the
 * unit reports itself unresolved rather than binding to something else.
 */
export class SpindleUnit {
  /**
   * @param {object} o
   * @param {import('./tensegrity.js').Tensegrity} o.solver
   * @param {string} o.nodeA   network node name, e.g. 'vert:C1'
   * @param {string} o.nodeB   network node name, e.g. 'vert:C3'
   * @param {string} o.label   human-readable region name
   * @param {string} o.muscleId anatomical ID of the host structure, for the inspector
   */
  constructor({ solver, nodeA, nodeB, label, muscleId }) {
    this.solver = solver;
    this.label = label;
    this.muscleId = muscleId;
    this.nodeA = nodeA;
    this.nodeB = nodeB;

    this.element = findElement(solver, nodeA, nodeB);
    this.resolved = this.element >= 0;
    /**
     * Reference length, metres — what ΔL and strain are measured against.
     *
     * This is the *settled* length of the element in the standing body, not the
     * solver's construction rest length, and the distinction is not a detail.
     * `erest0` is a geometric parameter of the network; a spindle's baseline
     * discharge is defined at the muscle's in-situ resting length, which is
     * where the pre-stressed network actually comes to rest. Measured here the
     * two differ by around 3.7 % for the cervical cables — enough, against a
     * length gain expressed in spikes per millimetre, to drive the modelled
     * afferent to silence at rest, which is the one thing a primary ending
     * demonstrably does not do.
     *
     * This requires the solver to have been settled before the unit is built.
     * The fallback keeps a unit constructed against a cold solver merely wrong
     * in its baseline rather than divided by zero.
     */
    const settled = this.resolved ? solver.eLen[this.element] : 0;
    this.L0 = settled > 1e-6 ? settled : this.resolved ? solver.erest0[this.element] : 0;
    /** construction rest length, metres — reported alongside, never the reference */
    this.LAnat = this.resolved ? solver.erest0[this.element] : 0;

    /* ---- live state ---- */
    this.L = this.L0; // current length, m
    this.dL = 0; // ΔL from reference, m
    this.strain = 0; // dimensionless
    this.velocity = 0; // dL/dt, m/s (low-passed)
    this.adapt = 1; // static-term adaptation, 0..1
    this.rate = 0; // spikes/s
    this.rateMean = 0; // displayed rate, lightly smoothed
    this.delay = conductionDelay(); // s
    this.spikeCount = 0;

    /* ---- model selection ----
       'basic' is the product default and is the law this ROI shipped with:
       rate from length and velocity directly. 'extended' routes the same length
       through an intrafusal tension proxy with history, and adds fusimotor
       drive. Switching resets the extended state, because carrying a
       cross-bridge history across a model change would mean the first seconds
       after the switch described a mechanism that was not running. */
    this.model = 'basic';
    this.gamma = { static: 0, dynamic: 0 };
    this.extended = new ExtendedDrive();

    /* Optional imposed length trajectory. When a scenario is running the unit
       reads it instead of the solver, so a protocol is exactly what it says it
       is — the living body is never exactly anything twice, and the history
       measurement in particular needs a repeatable stimulus. */
    this.protocol = null;
    this.protocolT = 0;

    this._phase = 0;
    this._prevL = this.L0;
    this._t = 0; // model clock, seconds
    this._acc = 0; // leftover frame time

    /** scratch for inFlight(), so a per-frame read allocates nothing */
    this._flight = new Float32Array(SPIKE_RING);

    /** ring of recent spikes: emission and arrival times on the model clock */
    this.spikes = new Array(SPIKE_RING);
    this._spikeHead = 0;
    for (let i = 0; i < SPIKE_RING; i++) this.spikes[i] = { emitted: -1e9, arrives: -1e9 };
  }

  /** Model clock, seconds. Pulse phases are computed against this. */
  get time() {
    return this._t;
  }

  /** ΔL in millimetres — the unit the rate model is written in. */
  get dL_mm() {
    return this.dL * 1000;
  }

  /** Lengthening velocity in mm/s. */
  get velocity_mms() {
    return this.velocity * 1000;
  }

  /**
   * Advance the model by one frame's worth of time.
   *
   * `dt` is real elapsed time. The length is sampled once per frame — that is
   * how often the solver produces a new one — but the rate model, the
   * adaptation and the spike generator are integrated at SPIKE_DT so timing
   * does not depend on the frame rate. Between solver samples the length is
   * interpolated linearly, which is the honest thing to do with a signal that
   * genuinely is only known at frame boundaries.
   */
  step(dt) {
    if (!this.resolved || !(dt > 0)) return;

    /* Length comes from the solve, unless a scenario is imposing one. */
    let L;
    if (this.protocol) {
      this.protocolT += dt;
      if (this.protocolT > protocolDuration(this.protocol) + this.protocol.tailS) {
        this.stopProtocol();
        L = this.solver.eLen[this.element];
      } else {
        L = this.L0 + protocolLength(this.protocol, this.protocolT) * 1e-3; // mm → m
      }
    } else {
      L = this.solver.eLen[this.element];
    }
    const prevL = this._prevL;
    this._prevL = L;

    this._acc += dt;
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(this._acc / SPIKE_DT)));
    const h = this._acc / steps;
    this._acc = 0;

    const invL0 = 1 / Math.max(1e-9, this.L0);
    // velocity over the frame, held constant across its substeps
    const frameVel = (L - prevL) / Math.max(1e-6, dt);

    for (let k = 0; k < steps; k++) {
      const u = (k + 1) / steps;
      const Lk = prevL + (L - prevL) * u;
      const dLk = Lk - this.L0;

      this.adapt = stepAdaptation(this.adapt, dLk * 1000, h);
      /* One line is the whole difference between the two models. Everything
         downstream — the phase accumulator, the emission, the conduction stamp,
         the drawn pulses — is identical, which is the point: the Extended work
         changes what drives the ending, not how the ending speaks. */
      const r =
        this.model === 'extended'
          ? this.extended.step(dLk * 1000, frameVel * 1000, h, this.gamma)
          : iaRate(dLk * 1000, frameVel * 1000, this.adapt);

      /* Exact integrate-and-fire. Phase advances at r·h and emits on every unit
         crossing, so a rate of zero produces silence rather than a stalled
         phase.

         The crossing instant is solved for *within* the substep rather than
         rounded to its end. Phase runs from p₀ to p₀ + r·h over the step, so the
         m-th crossing falls at the fraction (m − p₀)/(r·h) through it. Without
         that, every spike time snaps to the 1 ms integration grid and the
         interval between spikes alternates between neighbouring milliseconds —
         a jitter of a few percent that is an artefact of the solver, not a
         property of the receptor, and that would then be visible in both the
         raster and the drawn pulse spacing. */
      const p0 = this._phase;
      const advance = r * h;
      this._phase = p0 + advance;
      let m = 1;
      while (this._phase >= 1) {
        this._phase -= 1;
        const f = advance > 0 ? (m - p0) / advance : 1;
        this._emit(this._t + Math.min(1, Math.max(0, f)) * h);
        m++;
      }
      this._t += h;
    }

    this.L = L;
    this.dL = L - this.L0;
    this.strain = this.dL * invL0;
    this.velocity = frameVel;
    this.rate = this.model === 'extended' ? this.extended.rate : iaRate(this.dL * 1000, frameVel * 1000, this.adapt);
    // a displayed rate needs to be readable, not instantaneous
    this.rateMean += (this.rate - this.rateMean) * Math.min(1, dt * 6);
    this.delay = conductionDelay();
  }

  /**
   * Switch drive model. Resets the extended mechanical history so the first
   * seconds after a switch are not describing a mechanism that was not running.
   */
  setModel(model) {
    const next = model === 'extended' ? 'extended' : 'basic';
    if (next === this.model) return this.model;
    this.model = next;
    this.extended.reset();
    return this.model;
  }

  setGamma(kind, value) {
    const v = Math.min(1, Math.max(0, +value || 0));
    if (kind === 'static' || kind === 'dynamic') this.gamma[kind] = v;
    return this.gamma;
  }

  /**
   * Impose a length trajectory for `spec`, then hand control back to the solver.
   * `tailS` keeps the unit on the imposed (resting) length for a moment after the
   * protocol ends, so the return to live length is not itself a step stretch.
   */
  startProtocol(spec) {
    if (!spec) return false;
    this.protocol = { tailS: 1.5, ...spec };
    this.protocolT = 0;
    this.extended.reset();
    return true;
  }

  stopProtocol() {
    this.protocol = null;
    this.protocolT = 0;
  }

  get protocolRunning() {
    return !!this.protocol;
  }

  _emit(t) {
    const s = this.spikes[this._spikeHead];
    s.emitted = t;
    s.arrives = t + this.delay;
    this._spikeHead = (this._spikeHead + 1) % SPIKE_RING;
    this.spikeCount++;
  }

  /**
   * Spikes currently in transit, as normalised positions along the axon.
   * 0 = at the ending, 1 = arriving centrally. Written into `out` to avoid
   * allocating every frame; returns how many were written.
   *
   * When there are more in transit than `limit` — a low quality tier drawing a
   * sparser axon — the survivors are taken by an even stride over the sorted
   * positions rather than by taking the first `limit` found. Filling in ring
   * order would hand the renderer a clump: which slots come first is an artefact
   * of where the write head happens to be, so the drawn train would bunch and
   * gap at random while the underlying timing was perfectly regular. Striding
   * keeps a thinned train looking like a thinned train.
   */
  inFlight(out, limit = out.length) {
    const t = this._t;
    const d = Math.max(1e-6, this.delay) * PULSE_TIME_DILATION;

    let total = 0;
    for (let i = 0; i < SPIKE_RING; i++) {
      const s = this.spikes[i];
      const u = (t - s.emitted) / d;
      if (u >= 0 && u <= 1) this._flight[total++] = u;
    }
    if (total === 0) return 0;

    const view = this._flight.subarray(0, total);
    view.sort();
    if (total <= limit) {
      out.set(view, 0);
      return total;
    }
    if (limit <= 1) {
      out[0] = view[total - 1];
      return 1;
    }
    for (let k = 0; k < limit; k++) out[k] = view[Math.round((k * (total - 1)) / (limit - 1))];
    return limit;
  }

  /** Spike times within the last `window` seconds, oldest first — for a raster. */
  recent(window = 1) {
    const t = this._t;
    const out = [];
    for (let i = 0; i < SPIKE_RING; i++) {
      const s = this.spikes[i];
      if (t - s.emitted <= window && s.emitted > -1e8) out.push(s.emitted);
    }
    return out.sort((a, b) => a - b);
  }

  /** Everything the HUD and the diagnostics dump need. */
  readout() {
    return {
      label: this.label,
      muscleId: this.muscleId,
      resolved: this.resolved,
      restLengthMm: +(this.L0 * 1000).toFixed(3),
      anatomicalRestMm: +(this.LAnat * 1000).toFixed(3),
      lengthMm: +(this.L * 1000).toFixed(4),
      deltaLengthMm: +(this.dL * 1000).toFixed(4),
      strainPct: +(this.strain * 100).toFixed(3),
      velocityMmS: +(this.velocity * 1000).toFixed(3),
      rateHz: +this.rate.toFixed(1),
      rateMeanHz: +this.rateMean.toFixed(1),
      adaptation: +this.adapt.toFixed(3),
      conductionDelayMs: +(this.delay * 1000).toFixed(2),
      spikes: this.spikeCount,
      model: this.model,
      gammaStatic: this.gamma.static,
      gammaDynamic: this.gamma.dynamic,
      protocol: this.protocol?.id ?? null,
      ...(this.model === 'extended' ? this.extended.readout() : {}),
    };
  }
}

/**
 * Find the element joining two named nodes, in either direction.
 * Returns -1 when the pair does not exist, so a renamed node surfaces as an
 * unresolved ROI instead of silently binding the spindle to another muscle.
 */
export function findElement(solver, nameA, nameB) {
  const a = solver.index(nameA);
  const b = solver.index(nameB);
  if (a < 0 || b < 0) return -1;
  for (let e = 0; e < solver.elemCount; e++) {
    if ((solver.ea[e] === a && solver.eb[e] === b) || (solver.ea[e] === b && solver.eb[e] === a)) return e;
  }
  return -1;
}

/* ============================================================
   Regions of interest
   ============================================================ */

/**
 * Available micro ROIs, best first.
 *
 * The deep dorsal neck was chosen on measurement, not preference: sampling
 * every network element over fourteen seconds of running physiology, the
 * C1–C3 posterior element carries 1.21 % peak-to-peak strain — the largest of
 * any cervical or dorsal muscle-like element in the model, and larger than
 * scalene (0.77 %) despite scalene's greater absolute excursion, because a
 * spindle encodes fractional length change rather than millimetres. It is also
 * the region the anatomy literature reports the highest spindle densities in,
 * which is why it is worth looking at first.
 *
 * The others are kept as alternates and as the hooks the next ROIs will use.
 */
export const MICRO_ROIS = [
  {
    id: 'suboccipital',
    label: 'Deep dorsal neck · C1–C3',
    detail: 'Suboccipital-adjacent posterior cervical group',
    nodeA: 'vert:C1',
    nodeB: 'vert:C3',
    muscleId: 'MUSCLE_SPLENIUS_L',
    receptor: 'spindle',
  },
  {
    id: 'scalene',
    label: 'Scalene · C4–rib 2',
    detail: 'Deep lateral cervical; length modulated by rib elevation',
    nodeA: 'vert:C4',
    nodeB: 'rib:2:lat:L',
    muscleId: 'MUSCLE_SCALENE_L',
    receptor: 'spindle',
  },
];

/** Build the first resolvable ROI. Returns null if none resolve. */
export function buildSpindle(solver, roiId = null) {
  const list = roiId ? MICRO_ROIS.filter((r) => r.id === roiId) : MICRO_ROIS;
  for (const roi of list) {
    const unit = new SpindleUnit({
      solver,
      nodeA: roi.nodeA,
      nodeB: roi.nodeB,
      label: roi.label,
      muscleId: roi.muscleId,
    });
    if (unit.resolved) {
      unit.roi = roi;
      return unit;
    }
  }
  return null;
}
