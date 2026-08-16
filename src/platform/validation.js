/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Validation inventory.

   Every substantial module in this product, classified by how well
   grounded it actually is. This is the machine-readable twin of
   VALIDATION_MATRIX.md: the document is written for a reader, this is
   written so the classification can be queried, counted, and checked
   against the document rather than drifting away from it quietly.

   The point of keeping it in code rather than only in prose: a claim
   about how grounded something is has a way of ageing badly, and prose
   that nobody can test ages fastest. `CONTINUUM.validation.summary()`
   reports the counts; a repo check asserts the document and this file
   agree.

   ── STATUS ─────────────────────────────────────────────────────
     grounded          the behaviour or equation pattern is citable.
                       May still be simplified — grounded is not
                       "validated", and nothing here is validated.
     partial           the structure is present, but the parameters
                       are illustrative or carry verified:false.
     novel             specific to this product. Needs foundation
                       experiments before any predictive claim.
     speculative       a composite or an assumption with no external
                       anchor at all.
     out_of_scope_v1   not required for the claims this version makes,
                       and not implemented.

   None of these statuses means "validated against data". This product
   holds no measured series, so no row can earn that word, and the
   enum deliberately has no value for it.
   ============================================================ */

export const STATUS = Object.freeze({
  grounded: {
    id: 'grounded',
    label: 'Grounded',
    blurb: 'Behaviour or equation pattern is citable. Simplified, but the shape is not invented here.',
  },
  partial: {
    id: 'partial',
    label: 'Partial',
    blurb: 'Structure present; parameters illustrative or unverified.',
  },
  novel: {
    id: 'novel',
    label: 'Novel',
    blurb: 'Specific to this product. Needs foundation experiments before any predictive claim.',
  },
  speculative: {
    id: 'speculative',
    label: 'Speculative',
    blurb: 'Composite or assumption with no external anchor.',
  },
  out_of_scope_v1: {
    id: 'out_of_scope_v1',
    label: 'Out of scope (v1)',
    blurb: 'Not implemented, and not required for the claims this version makes.',
  },
});

/**
 * @typedef {object} ValidationRow
 * @property {string} id
 * @property {string} module
 * @property {string} surface      code and UI where it lives
 * @property {string[]} anchors    citation keys, DOIs, or 'citation pending'
 * @property {string} target       what would have to be shown for this to move up
 * @property {keyof STATUS} status
 * @property {string} evidence     what exists in this repo right now
 * @property {string} next         the honest next action
 */

/** @type {ValidationRow[]} */
export const VALIDATION_ROWS = [
  {
    id: 'anatomy',
    module: 'Multi-scale anatomy & tensegrity visualisation',
    surface: 'anatomy/, gfx/, core/scales.js — the 3D view and scale ladder',
    anchors: ['citation pending — published adult proportions, no specific source recorded in code'],
    target: 'Structure positions and proportions checked against a named anatomical reference.',
    status: 'partial',
    evidence:
      '271 structures + 1 469 receptor endings, procedurally generated, 1740 IDs with manifest hash 238ca549. ' +
      'Proportions are asserted in prose; no per-structure provenance field exists.',
    next: 'Record a reference per system, or state plainly that geometry is illustrative rather than metric.',
  },
  {
    id: 'solver',
    module: 'Live mechanical / tensegrity solve',
    surface: 'sim/tensegrity.js — position-based dynamics, tension-only cables',
    anchors: ['citation pending — biotensegrity literature for the qualitative premise', 'PBD is a standard method, not a claim about tissue'],
    target: 'Load-distribution pattern compared against a published whole-body measurement, or explicit statement that it is qualitative.',
    status: 'partial',
    evidence:
      '469 elements, 166 nodes, deterministic settle, reproducible continuity figures (plantar tension → +8.8 % calf, ' +
      '+12.1 % lumbar, +1.0 % cervical). Numbers are stable and self-consistent; nothing external anchors their magnitude.',
    next: 'Say explicitly in the README that the attenuation profile is a modelled pattern, not a measured one.',
  },
  {
    id: 'interventions',
    module: 'Interventions (tension, compression, restriction, shear, release)',
    surface: 'core/store.js TOOLS, sim/tensegrity.js interventions, right panel',
    anchors: ['citation pending'],
    target: 'Each mode mapped to a defined tissue-mechanical change with a source, rather than a tuned solver effect.',
    status: 'partial',
    evidence: 'Five modes applied through one solver path with magnitude and radius. Directions are plausible and internally consistent.',
    next: 'Document what each mode does to the solver in one line each, the way METRICS.md does for the metrics.',
  },
  {
    id: 'afferent-whole-body',
    module: 'Whole-body afferent / transmission path',
    surface: 'sim/afferent.js, data/afferent_params.js, anatomy/info.js receptor descriptors, telemetry strip',
    anchors: [
      'TEXTBOOK_CONSENSUS_BAND / _CV / _SIZE — category labels, not references',
      'MODEL_TUNING — 21 of 42 constants have no external anchor at all',
    ],
    target:
      'Each of the 21 range-anchored constants checked against a named primary source and marked verified ' +
      'individually. The 21 MODEL_TUNING constants cannot reach that bar — they would need a calibration this ' +
      'product does not have.',
    status: 'partial',
    evidence:
      'All 42 constants the transduction model reads now carry a unit, a biological meaning, a species field, a ' +
      'stated range where one exists, a citation category and notes — data/afferent_params.js, with anatomy/info.js ' +
      'reading from it rather than holding literals. Values are unchanged and frozen against a baseline that ' +
      'tools/check-afferent-params.mjs enforces. **Verified: 0.** The honest split the table forced: 21 are ' +
      'MODEL_TUNING (every tau, threshold and phasic) with no source and, for threshold, no physical unit at all; ' +
      '21 sit inside a textbook-consensus band, where the *range* is the citable part and the point value is still ' +
      'a choice nobody sourced.',
    next:
      'Source the 14 range-anchored records that have numeric ranges, one at a time, setting verified:true only on ' +
      'records whose paper a human has actually read. See AFFERENT_PARAMS.md for the checklist. The MODEL_TUNING ' +
      'group should be described as tuning in any write-up rather than quietly presented as physiology.',
  },
  {
    id: 'micro-basic',
    module: 'Microscope Basic spindle drive (default)',
    surface: 'sim/spindle.js iaRate(), Microscope panel → Drive model → Basic',
    anchors: ['prochazka1999', 'prochazka1998', 'matthews1972', 'hunt1990'],
    target: 'Parameters checked against the primary sources and marked verified.',
    status: 'partial',
    evidence:
      'r = r₀ + k_v·[v]₊^p + k_L·a(t)·ΔL — a citable model *shape*. All parameter records carry verified:false and null DOIs. ' +
      'Direction verified in-repo: rate rises with length, adaptation relaxes to a floor and recovers.',
    next: 'A human checks each of the eight parameters against its paper and sets verified:true individually.',
  },
  {
    id: 'micro-extended',
    module: 'Microscope Extended drive (history, tension/yank-style, γ)',
    surface: 'sim/spindle_extended.js, Microscope panel → Drive model → Extended',
    anchors: ['blum2020 — doi:10.7554/eLife.55177, inspiration for qualitative targets only'],
    target:
      'Qualitative targets reproduced: history dependence recovering over seconds, and a dynamic response that grows with ' +
      'stretch velocity. Never a numeric match to any figure.',
    status: 'partial',
    evidence:
      'Both qualitative targets met in-repo: second-stretch ratio 0.57 at 0.5 s recovering to 0.98 at 10 s, monotone in the gap; ' +
      'early burst 98→208 Hz across a 2–16.7 mm/s ramp series with the plateau moving 1 %. All 14 parameters verified:false — ' +
      'the citation key marks the *phenomenon*, not the value, and none of the values comes from the paper.',
    next:
      'Keep the wording as inspiration. Any move beyond partial needs a digitised comparison series, which this product ' +
      'does not have and should not fabricate.',
  },
  {
    id: 'spike-conduction',
    module: 'Spike timing & conduction delay',
    surface: 'sim/spindle.js — exact integrate-and-fire, conductionDelay()',
    anchors: ['burke_gandevia (conduction velocity)', 'NEEDS_PRIMARY_SOURCE (path length, synaptic delay)'],
    target: 'Path length and synaptic delay given real sources; conduction velocity range confirmed.',
    status: 'partial',
    evidence:
      'Integrate-and-fire is exact: constant drive gives ISI = 1/r with CV = 0, verified offline. Delay arithmetic verified ' +
      'across five path-length and velocity conditions. Two of its three parameters carry the placeholder key NEEDS_PRIMARY_SOURCE.',
    next: 'Source the path length and synaptic delay, or state a defended assumption for each.',
  },
  {
    id: 'protocols',
    module: 'Literature protocol presets / scenarios',
    surface: 'sim/spindle_extended.js PROTOCOLS, Microscope panel → Scenario',
    anchors: ['shape only — ramp–hold–release is a standard stretch protocol form'],
    target: 'Nothing further. These are stimulus shapes, not results.',
    status: 'grounded',
    evidence:
      'Seven presets. Amplitudes are stated as educational values chosen to avoid saturation, not taken from any figure. ' +
      'Each carries an expected *direction* and a safeFor field; mismatched drive/preset pairs are warned about before running.',
    next: 'None. Resist any pressure to attach a score to these — there is no series here to score against.',
  },
  {
    id: 'experiment',
    module: 'Computational experiment (baseline vs perturbation)',
    surface: 'sim/experiment.js, right panel → Computational experiment',
    anchors: ['method is a controlled comparison; no external anchor is needed for the method itself'],
    target: 'That the two conditions differ only by the perturbation. Verified by construction.',
    status: 'grounded',
    evidence:
      'Same protocol, same drive code, same seed; only the input differs. Monotone in magnitude for both delivered strain and ' +
      'peak rate. Saturation is detected and warned about rather than hidden. Every result carries EXPERIMENT_CAPTION.',
    next:
      'None for the method. What the method is *applied to* is what carries the uncertainty, and those rows are above and below.',
  },
  {
    id: 'perturbation-model',
    module: 'Restriction perturbation model (k_trans, lag)',
    surface: 'sim/experiment.js perturbationTerms(), params keyed REX_MODELLING_ASSUMPTION',
    anchors: ['none — explicitly this product’s own assumption'],
    target:
      'A measurement relating an applied manual or mechanical intervention to the excursion actually delivered at depth, and ' +
      'to the local time constant. Neither exists here.',
    status: 'novel',
    evidence:
      'transmission = 1/(1 + k_trans·m); tau = tau_0·(1 + k_lag·m). Three parameters, all verified:false, all carrying a ' +
      'citation key that says outright there is no literature source. Shapes are reused from the whole-body afferent model ' +
      'so the two paths cannot disagree in direction — which is consistency, not evidence.',
    next:
      'This is the row that most needs foundation measurement. Until then no experiment result that depends on it may be ' +
      'described as anything but a prediction under an assumption.',
  },
  {
    id: 'metrics-level-c',
    module: 'Level C composite metrics (network load, signal integrity, fidelity, latency, bandwidth, asymmetry, …)',
    surface: 'platform/layers.js OUTPUTS, sim/afferent.js, sim/tensegrity.js, telemetry strip',
    anchors: ['none — these are summaries defined here; see METRICS.md'],
    target:
      'Not applicable as science. The target is that each one states its formula and is never read as a measurement.',
    status: 'speculative',
    evidence:
      'All ten meters tagged “C” with the formula in the tooltip. METRICS.md gives each definition. Signal integrity is ' +
      'fidelity^0.5 × bandwidth^0.3 × timing^0.2 — the exponents are a chosen weighting and METRICS.md says so.',
    next: 'Keep them labelled. Never retune a weighting to make a visualisation look right.',
  },
  {
    id: 'entitlements',
    module: 'Entitlements / freemium gates',
    surface: 'platform/entitlements.js, platform/auth.js, locked UI states',
    anchors: ['not applicable — product, not science'],
    target: 'That gates hold at the engine, not only in the UI.',
    status: 'grounded',
    evidence:
      'Capability model enforced at the source. Verified: free tier cannot reach deep scale by wheel, tier jump, direct span ' +
      'call or scripted flag write; ten capabilities blocked; overlay painting gated at paintOverlay() after a scripted bypass ' +
      'was found and closed.',
    next: 'None. Re-run the gate suite whenever a new capability is added.',
  },
  {
    id: 'gto-ib',
    module: 'Golgi tendon organ / Ib mechanics',
    surface: 'anatomy/info.js golgi class + population rate coding only — no dedicated Ib model',
    anchors: ['citation pending'],
    target: 'A force-driven Ib model with tendon-organ mechanics, comparable to the spindle micro path.',
    status: 'out_of_scope_v1',
    evidence:
      'A Golgi population *exists* in the whole-body afferent model with its own band, tau and threshold, and appears in the ' +
      'telemetry breakdown. There is no Ib micro-mechanical model, no force-based drive, and no tendon-organ geometry. ' +
      'The Microscope hooks would take one (the spike generator and conduction stage are receptor-agnostic).',
    next: 'Leave out of v1. If added, it needs its own parameter table before it earns any status above partial.',
  },
  {
    id: 'fem',
    module: 'Full constitutive soft-tissue FEM',
    surface: 'not implemented',
    anchors: ['not applicable'],
    target: 'A continuum formulation with a constitutive law, meshing and convergence testing.',
    status: 'out_of_scope_v1',
    evidence:
      'None. The solver is position-based dynamics on a discrete network — deliberately, because it runs at 60 fps in a ' +
      'browser and expresses the continuity premise. It is not a stress analysis and does not report stress.',
    next: 'Leave out of v1. Adding it would change what the product is, not just what it computes.',
  },
  {
    id: 'device-ingest',
    module: 'Surface device calibration ingest (myotonometry, SWE, …)',
    surface: 'platform/datasets.js — generic ID-keyed dataset loader; public/datasets/shear-modulus-demo.json',
    anchors: ['not applicable to the loader; any real ingest would inherit the device’s own validation'],
    target: 'A real exported series from a named device, with units, and a documented mapping from device site to anatomical ID.',
    status: 'novel',
    evidence:
      'The *ingest path* exists and is validated: schema versioning, unit and field checks, alias resolution, unresolved IDs ' +
      'reported rather than dropped, round-trips through a saved project. The bundled dataset is labelled ' +
      '"synthetic demonstration set · not measured data" in its own source field.',
    next:
      'A real ingest needs a site→ID mapping and a statement of what the device measures. The loader is ready; the ' +
      'calibration is not started.',
  },
  {
    id: 'rex-hypothesis',
    module: 'Rex zone / restriction hypothesis as a scientific claim',
    surface: 'expressed through the perturbation layer; no dedicated code path',
    anchors: ['none'],
    target:
      'Independent physiological outcomes measured in people, against a documented intervention protocol, with prespecified ' +
      'endpoints. Nothing in this repository is a step toward that.',
    status: 'novel',
    evidence:
      'The product can show what a published-style receptor model predicts *if* mechanics change in an assumed way. That is ' +
      'the whole of it. The model was built to express these ideas, so it cannot also be their test.',
    next:
      'Foundation measurement protocols first. Until those exist, in-sim results are illustrations of the hypothesis, ' +
      'not evidence for it — see the falsification note in VALIDATION_MATRIX.md.',
  },
];

/** Counts by status, plus a flat listing. */
export function summary() {
  const counts = {};
  for (const k of Object.keys(STATUS)) counts[k] = 0;
  for (const r of VALIDATION_ROWS) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return {
    total: VALIDATION_ROWS.length,
    counts,
    /* The honest headline: nothing in this product is validated against measured
       data, and the enum has no value that would let a row claim otherwise. */
    validatedAgainstMeasuredData: 0,
    rows: VALIDATION_ROWS.map((r) => ({ id: r.id, module: r.module, status: r.status })),
  };
}

/** One row, by id. */
export function row(id) {
  return VALIDATION_ROWS.find((r) => r.id === id) ?? null;
}

/** Every row with a given status. */
export function withStatus(status) {
  return VALIDATION_ROWS.filter((r) => r.status === status);
}

/** Rows whose parameters are known to be unverified — the working to-do list. */
export function needsSourcing() {
  return VALIDATION_ROWS.filter((r) => r.status === 'partial' || r.status === 'speculative' || r.status === 'novel');
}
