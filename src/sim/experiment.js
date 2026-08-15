/* ============================================================
   Computational experiments.

   A controlled comparison: run one protocol twice, once clean and
   once with a mechanical perturbation, and report what changed in the
   Layer B receptor outputs. Same trajectory, same model, same seed —
   the only difference is the perturbation, which is what makes the
   difference attributable to it.

   ── WHAT A RESULT FROM HERE MEANS ──────────────────────────────
   It is an in-silico prediction under the selected receptor model. It
   says: *if* the mechanics changed in the specified way, *then* a
   published-style model of a Ia ending would report this change.

   It is not human data. It is not evidence for or against any
   hypothesis, including the ones this product was built to express —
   a model built to express an idea cannot also be that idea's test.
   That sentence lives in platform/layers.js and every surface that
   shows a result reads it from there.

   ── HOW THE PERTURBATION REACHES THE RECEPTOR ──────────────────
   Not by a second physics engine. A restriction is assumed to do two
   things to the movement arriving at the ending, both parameterised in
   the table and both flagged there as *this product's assumptions*:

     transmission   less of an imposed excursion reaches the receptor,
                    because a stiffer parallel path takes a larger
                    share of it:   x' = x / (1 + k_trans · m)

     lag            the local relaxation time constant lengthens, so
                    the movement arrives smeared:
                    tau = tau_0 · (1 + k_lag · m)

   Both shapes are lifted from the whole-body afferent model, which
   already treats restriction as a loss of glide that lengthens tau.
   Reusing the shape means the two paths cannot disagree about the
   direction of an effect; inventing a second one would let them.

   Release is modelled as the same two terms with the sign reversed and
   at reduced magnitude — a release restores glide, it does not create
   more than healthy tissue had.
   ============================================================ */

import { P } from '../data/micro/literature_params.js';
import { ExtendedDrive, protocolLength, protocolDuration } from './spindle_extended.js';
import { iaRate, stepAdaptation } from './spindle.js';

/**
 * Mechanical perturbations available to an experiment.
 *
 * Deliberately the same vocabulary as the main intervention tool, so a user
 * who has applied a restriction to a structure recognises what this is doing.
 * `sign` scales both terms; `cap` limits how far a mode may be pushed.
 */
export const PERTURBATIONS = Object.freeze({
  none: { id: 'none', name: 'Baseline', sign: 0, blurb: 'No perturbation. The control condition.' },
  restriction: {
    id: 'restriction',
    name: 'Restriction',
    sign: 1,
    blurb: 'Loss of glide: less excursion reaches the ending, and what arrives is smeared in time.',
  },
  tension: {
    id: 'tension',
    name: 'Tension',
    sign: 0.55,
    blurb: 'Raised resting tension. Modelled as a milder version of the same transmission and lag change.',
  },
  release: {
    id: 'release',
    name: 'Release',
    sign: -0.5,
    blurb: 'Restored glide. The same terms with the sign reversed, and capped — a release cannot beat healthy tissue.',
  },
});

/**
 * A first-order lag applied to a length trajectory.
 *
 * Stateless per call; the caller owns `state`. Separate from the drive's own
 * low-pass on yank, which is numerical — this one is a claim about tissue.
 */
function lagStep(state, target, dt, tau) {
  if (!(tau > 1e-9)) return target;
  const k = 1 - Math.exp(-dt / tau);
  return state + (target - state) * k;
}

/**
 * Transmission fraction and lag time constant for a perturbation.
 *
 * @param {string} mode        key of PERTURBATIONS
 * @param {number} magnitude   0..1, the same scale the intervention tool uses
 */
export function perturbationTerms(mode, magnitude) {
  const spec = PERTURBATIONS[mode] || PERTURBATIONS.none;
  const m = Math.max(0, Math.min(1, magnitude)) * spec.sign;
  if (m === 0) return { transmission: 1, tau: P('restrictionTauBase'), magnitude: 0, mode: spec.id };
  if (m > 0) {
    return {
      transmission: 1 / (1 + P('restrictionTransmission') * m),
      tau: P('restrictionTauBase') * (1 + P('restrictionLagGain') * m),
      magnitude: m,
      mode: spec.id,
    };
  }
  /* A release restores glide toward healthy tissue and stops there. Letting it
     run past 1.0 transmission would be claiming that intervention makes tissue
     transmit better than tissue does, which is not a claim this product makes. */
  const relief = Math.min(1, -m);
  return {
    transmission: 1 + 0.15 * relief,
    tau: P('restrictionTauBase') * (1 - 0.5 * relief),
    magnitude: m,
    mode: spec.id,
  };
}

/**
 * Run one protocol through one drive model, optionally perturbed.
 *
 * @param {object} spec        protocol, as in PROTOCOLS
 * @param {object} [opts]
 * @param {'basic'|'extended'} [opts.model]
 * @param {string} [opts.perturbation]  key of PERTURBATIONS
 * @param {number} [opts.magnitude]     0..1
 * @param {object} [opts.gamma]
 * @param {number} [opts.dt]
 * @param {number} [opts.settle]
 */
export function runCondition(spec, opts = {}) {
  const dt = opts.dt ?? 1 / 1000;
  const settle = opts.settle ?? 12;
  const model = opts.model === 'extended' ? 'extended' : 'basic';
  const gamma = opts.gamma ?? { static: 0, dynamic: 0 };
  const terms = perturbationTerms(opts.perturbation ?? 'none', opts.magnitude ?? 0);

  const drive = new ExtendedDrive();
  let adapt = 1;
  let lagged = 0;
  let prevX = 0;

  const out = { t: [], x: [], v: [], rate: [], tension: [], yank: [], availability: [], adaptation: [] };

  // rest first, so both conditions start from the same fully recovered state
  const nSettle = Math.round(settle / dt);
  for (let i = 0; i < nSettle; i++) {
    if (model === 'extended') drive.step(0, 0, dt, gamma);
    else adapt = stepAdaptation(adapt, 0, dt);
  }

  const n = Math.round(protocolDuration(spec) / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    /* The perturbation acts on the trajectory *before* the receptor sees it.
       Transmission scales it; the lag smears it. Neither touches the drive
       model, which is the point — one physics, perturbed at its input. */
    const commanded = protocolLength(spec, t) * terms.transmission;
    lagged = lagStep(lagged, commanded, dt, terms.tau);
    const x = lagged;
    const v = (x - prevX) / dt;
    prevX = x;

    let r;
    if (model === 'extended') {
      r = drive.step(x, v, dt, gamma);
    } else {
      adapt = stepAdaptation(adapt, x, dt);
      r = iaRate(x, v, adapt);
    }

    out.t.push(t);
    out.x.push(x);
    out.v.push(v);
    out.rate.push(r);
    out.tension.push(model === 'extended' ? drive.tension : NaN);
    out.yank.push(model === 'extended' ? drive.yank : NaN);
    out.availability.push(model === 'extended' ? drive.availability : NaN);
    out.adaptation.push(model === 'extended' ? NaN : adapt);
  }
  out.terms = terms;
  out.model = model;
  return out;
}

/* ============================================================
   Layer B metrics over a trace
   ============================================================ */

/**
 * The numbers an experiment compares. All Layer B except `maxStrainMm`, which
 * is Layer A and included because a reader should be able to see how much of a
 * rate change is simply less movement arriving.
 */
export function metricsOf(spec, trace) {
  const rampEnd = spec.rampMs / 1000;
  const holdEnd = rampEnd + spec.holdMs / 1000;
  const rMax = P('iaMaxRate');

  let peak = 0;
  let earlyPeak = 0;
  let plateau = 0;
  let maxX = 0;
  let spikes = 0;
  let phase = 0;
  let saturatedSamples = 0;

  for (let i = 0; i < trace.t.length; i++) {
    const t = trace.t[i];
    const r = trace.rate[i];
    if (r > peak) peak = r;
    if (t <= rampEnd + 0.05 && r > earlyPeak) earlyPeak = r;
    if (t <= holdEnd) plateau = r; // last sample inside the hold
    if (trace.x[i] > maxX) maxX = trace.x[i];
    if (r >= rMax - 1e-6) saturatedSamples++;
    if (i > 0) {
      const h = t - trace.t[i - 1];
      phase += r * h;
      while (phase >= 1) {
        phase -= 1;
        spikes++;
      }
    }
  }

  const availMin = trace.availability.reduce((m, v) => (Number.isFinite(v) && v < m ? v : m), 1);

  return {
    peakRateHz: +peak.toFixed(2),
    earlyBurstHz: +earlyPeak.toFixed(2),
    plateauHz: +plateau.toFixed(2),
    dynamicIndex: +(earlyPeak / Math.max(1e-6, plateau)).toFixed(3),
    spikes,
    maxStrainMm: +maxX.toFixed(4),
    availabilityMin: Number.isFinite(availMin) ? +availMin.toFixed(3) : null,
    /* Saturation is reported, never hidden. A run pinned at r_max is a run whose
       dynamic response has been eaten by the clamp, and every number derived
       from it is a measurement of the clamp instead of the receptor. */
    saturated: saturatedSamples > 0,
    saturatedFraction: +(saturatedSamples / trace.t.length).toFixed(4),
  };
}

/* ============================================================
   The experiment
   ============================================================ */

/**
 * Baseline versus perturbed, same protocol.
 *
 * @param {object} spec      protocol
 * @param {object} [opts]
 * @param {string} [opts.perturbation]
 * @param {number} [opts.magnitude]
 * @param {'basic'|'extended'} [opts.model]
 * @param {object} [opts.gamma]
 * @returns {{protocol:object, model:string, perturbation:object, baseline:object, perturbed:object, delta:object, warnings:string[]}}
 */
export function runExperiment(spec, opts = {}) {
  const model = opts.model === 'extended' ? 'extended' : 'basic';
  const mode = opts.perturbation ?? 'restriction';
  const magnitude = opts.magnitude ?? 0.6;

  const baseTrace = runCondition(spec, { ...opts, model, perturbation: 'none', magnitude: 0 });
  const pertTrace = runCondition(spec, { ...opts, model, perturbation: mode, magnitude });

  const baseline = metricsOf(spec, baseTrace);
  const perturbed = metricsOf(spec, pertTrace);

  const delta = {};
  for (const k of ['peakRateHz', 'earlyBurstHz', 'plateauHz', 'dynamicIndex', 'spikes', 'maxStrainMm', 'availabilityMin']) {
    const a = baseline[k];
    const b = perturbed[k];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    delta[k] = { from: a, to: b, abs: +(b - a).toFixed(4), pct: a === 0 ? null : +(((b - a) / Math.abs(a)) * 100).toFixed(1) };
  }

  /* Warnings the reader needs before they read anything else. */
  const warnings = [];
  if (baseline.saturated || perturbed.saturated) {
    warnings.push(
      `Rate reached the ${P('iaMaxRate')} spikes/s ceiling in ` +
        `${baseline.saturated && perturbed.saturated ? 'both conditions' : baseline.saturated ? 'the baseline' : 'the perturbed condition'}` +
        ' — the dynamic response is clipped and these numbers describe the clamp as much as the receptor. ' +
        'Use a smaller amplitude, or the Extended model whose gains suit multi-millimetre protocols.'
    );
  }
  if (model === 'basic' && spec.amplitudeMm >= 1.5) {
    warnings.push(
      'The Basic drive was calibrated for this ROI’s sub-millimetre excursion. At multi-millimetre amplitudes it ' +
        'saturates, which is a property of the gain choice rather than of the receptor.'
    );
  }
  return {
    protocol: { ...spec },
    model,
    perturbation: { ...PERTURBATIONS[mode], magnitude, terms: pertTrace.terms },
    baseline,
    perturbed,
    delta,
    warnings,
    traces: { baseline: baseTrace, perturbed: pertTrace },
  };
}

/**
 * A compact printable summary — what the console hook returns by default, so a
 * user gets the numbers and the caveats without having to know which fields to
 * look at.
 */
export function summarise(result) {
  const rows = Object.entries(result.delta).map(([k, d]) => ({
    metric: k,
    baseline: d.from,
    perturbed: d.to,
    change: d.pct === null ? `${d.abs > 0 ? '+' : ''}${d.abs}` : `${d.pct > 0 ? '+' : ''}${d.pct} %`,
  }));
  return {
    protocol: result.protocol.name,
    model: result.model,
    perturbation: `${result.perturbation.name} @ ${Math.round(result.perturbation.magnitude * 100)} %`,
    transmission: `${(result.perturbation.terms.transmission * 100).toFixed(1)} % of commanded excursion reaches the ending`,
    lagMs: +(result.perturbation.terms.tau * 1000).toFixed(2),
    rows,
    warnings: result.warnings,
  };
}
