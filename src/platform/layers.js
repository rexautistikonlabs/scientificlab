/* ============================================================
   Model layers — what kind of claim each number carries.

   This file exists because the product mixes three different sorts
   of output and they should never be read as if they were the same
   sort of thing:

     A — MECHANICAL PROXY
         Kinematic and mechanical quantities computed by the solver or
         derived directly from it. Length, velocity, strain, the
         intrafusal tension proxy, yank, cross-bridge availability.
         These are the safest outputs, and still proxies: "tension" is
         in arbitrary units, not newtons, and no number here was
         measured in tissue.

     B — LITERATURE-STYLE PHYSIOLOGICAL MODEL
         The receptor path: firing rate, spike times, adaptation,
         conduction delay, history ratios. Simplified and educational,
         structured after published models and cited where relevant.
         This is the serious scientific surface of the product.

     C — COMPOSITE SUMMARY
         Chrome metrics that aggregate many quantities into one number
         for the instrument strip: network load, signal integrity,
         peak rise, left/right asymmetry. Useful for watching a change
         propagate. NOT primary scientific outputs, and each one either
         states its formula or says plainly that it is a summary.

   The rule that follows from this, and the reason the file is here:

     A perturbation applied in this product is a *computational
     experiment under the selected model*. It predicts what a
     published-style receptor model would report if the mechanics
     changed in the way specified. It is not evidence about a person,
     it does not validate any hypothesis, and it proves nothing about
     any organisation's ideas. Saying otherwise would be reasoning in
     a circle: the model was built to express those ideas, so it
     cannot also be their test.

   Every label in the UI that carries a layer reads from here.
   ============================================================ */

/** @typedef {'A'|'B'|'C'} LayerId */

export const LAYERS = Object.freeze({
  A: {
    id: 'A',
    name: 'Mechanical proxy',
    short: 'Layer A',
    blurb: 'Computed by the solver or derived directly from it. Proxies, in stated units — nothing here was measured in tissue.',
    tone: 'safe',
  },
  B: {
    id: 'B',
    name: 'Literature-style model',
    short: 'Layer B',
    blurb:
      'A simplified, educational receptor model structured after published work. The serious scientific surface of this ' +
      'product, and still a model output rather than a recording.',
    tone: 'model',
  },
  C: {
    id: 'C',
    name: 'Composite summary',
    short: 'Layer C',
    blurb:
      'Aggregates several quantities into one number for the instrument strip. A summary visualisation, not a primary ' +
      'scientific output.',
    tone: 'summary',
  },
});

/**
 * What every named output is, and — where it is a composite — how it is built.
 *
 * `definition` is the honest one-liner shown on hover. Where a formula fits, it
 * is the formula; where it does not, it says what the number aggregates rather
 * than pretending to a precision it has not got.
 */
export const OUTPUTS = Object.freeze({
  /* ---- Layer A: mechanical proxies ---- */
  length: { layer: 'A', name: 'Element length', unit: 'mm', definition: 'Live length of the bound network element, from the solver.' },
  deltaLength: { layer: 'A', name: 'ΔL', unit: 'mm', definition: 'Length minus the settled resting length of the same element.' },
  strain: { layer: 'A', name: 'Strain', unit: '%', definition: 'ΔL / L₀, where L₀ is the settled resting length.' },
  velocity: { layer: 'A', name: 'dL/dt', unit: 'mm/s', definition: 'Length differenced over the frame.' },
  tension: {
    layer: 'A',
    name: 'Intrafusal tension proxy',
    unit: 'arbitrary units',
    definition: 'k_pe·[x]₊ + k_srs·a·s — a two-element proxy, not newtons. Only ratios and directions mean anything.',
  },
  yank: { layer: 'A', name: 'Yank', unit: 'u/s', definition: 'd(tension)/dt, low-passed. Same arbitrary units per second.' },
  availability: {
    layer: 'A',
    name: 'Cross-bridge availability',
    unit: '%',
    definition: 'Modelled fraction of short-range bonds attached. Recovers in time, breaks down with distance travelled.',
  },

  /* ---- Layer B: the receptor model ---- */
  rate: { layer: 'B', name: 'Ia firing rate', unit: 'spikes/s', definition: 'Output of the selected drive model, clamped to r_max.' },
  spikes: { layer: 'B', name: 'Spike times', unit: 's', definition: 'Exact integrate-and-fire on the modelled rate. Deterministic.' },
  adaptation: { layer: 'B', name: 'Adaptation', unit: '0–1', definition: 'Slow decay of the static term while a stretch is held (Basic model).' },
  conductionDelay: { layer: 'B', name: 'Conduction delay', unit: 'ms', definition: 'ℓ/v_c + t_syn, from the parameter table.' },
  historyRatio: {
    layer: 'B',
    name: 'Second-stretch ratio',
    unit: '×',
    definition: 'Peak rate of the second identical stretch divided by the first (Extended model).',
  },
  dynamicIndex: {
    layer: 'B',
    name: 'Dynamic index',
    unit: '×',
    definition: 'Peak rate during the ramp divided by the held plateau rate.',
  },

  /* ---- Layer C: composites ----
     Each of these is real arithmetic over real state, and each compresses
     something multi-dimensional into one bar. That compression is the reason
     they are labelled rather than presented as measurements. */
  load: {
    layer: 'C',
    name: 'Network load',
    unit: '%',
    definition:
      'RMS tension across all 469 elements, as a percentage of the same RMS in the calibrated resting state. ' +
      '100 % means the network is at its resting pre-tension.',
  },
  peak: {
    layer: 'C',
    name: 'Peak rise',
    unit: '%',
    definition:
      'Largest single-element rise above its own calibrated baseline, normalised by that baseline. One element out of 469 ' +
      'sets this number.',
  },
  asym: {
    layer: 'C',
    name: 'L/R asymmetry',
    unit: '%',
    definition:
      '(ΣT_left − ΣT_right) / (ΣT_left + ΣT_right) over elements whose home position is off the midline. A whole-body ' +
      'imbalance compressed to one signed number.',
  },
  integrity: {
    layer: 'C',
    name: 'Signal integrity',
    unit: '%',
    definition:
      'fidelity^0.5 × bandwidth^0.3 × timing^0.2, averaged over receptor classes and weighted by how much traffic each ' +
      'is generating. The exponents are a chosen weighting, not a measured one — this is a summary, not a measurement.',
  },
  fidelity: {
    layer: 'C',
    name: 'Fidelity',
    unit: '%',
    definition:
      'Per class, the amplitude that survived the tissue filter divided by the amplitude that would have arrived through ' +
      'healthy tissue; then averaged across classes weighted by firing.',
  },
  latency: {
    layer: 'C',
    name: 'Added latency',
    unit: 'ms',
    definition: 'Group delay through the current tissue path minus the same delay through the healthy-tissue baseline.',
  },
  bandwidth: {
    layer: 'C',
    name: 'Bandwidth',
    unit: '%',
    definition: 'The −3 dB corner of the transmission path divided by the highest frequency each class is built to resolve.',
  },
  firing: {
    layer: 'C',
    name: 'Afferent rate',
    unit: 'Hz',
    definition: 'Sum of modelled firing across all seven receptor populations. A population total, not one ending.',
  },
  excursion: { layer: 'C', name: 'Breath excursion', unit: '%', definition: 'Achieved diaphragm travel divided by commanded travel.' },
  fluid: { layer: 'C', name: 'Fluid transport', unit: '%', definition: 'Composite of modelled venous return and lymph flow.' },
});

/** Layer of a named output, or null when the name is unknown. */
export function layerOf(id) {
  return OUTPUTS[id]?.layer ?? null;
}

/** Everything belonging to one layer. */
export function outputsIn(layer) {
  return Object.entries(OUTPUTS)
    .filter(([, o]) => o.layer === layer)
    .map(([id, o]) => ({ id, ...o }));
}

/**
 * The sentence the product uses whenever a perturbation result is shown.
 *
 * Deliberately one sentence, deliberately conditional, and deliberately about
 * the model rather than about a body. Kept here so every surface says the same
 * thing and changing it changes all of them at once.
 */
export const EXPERIMENT_CAPTION =
  'In-silico prediction under the selected model — not human data, and not evidence for or against any hypothesis.';

/**
 * The longer form, for the disclosure panel.
 */
export const LAYER_NOTE =
  'Under this published-style receptor model, changing these mechanical parameters produces the predicted change in ' +
  'afferent behaviour shown. The model was built to express a set of mechanical ideas, so it cannot also be their test.';
