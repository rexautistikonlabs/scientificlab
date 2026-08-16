/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Literature-constrained parameters for the micro-mechanics mode.

   Every number the micro animation depends on lives here, with its
   range, its units, the species it was measured in, and where it came
   from. Animation code reads this table; it must not contain naked
   constants of its own. If a value is not in here, it is not a
   parameter — it is a bug.

   ── HUMAN REVIEW REQUIRED ──────────────────────────────────────────
   The `citation` blocks below name works whose existence and content a
   human must confirm against the primary source before any of this is
   published or used in a claim. `doi` and `pmid` are deliberately null
   rather than guessed: a fabricated identifier is worse than a missing
   one. Fill them in, check each value against the paper, and set
   `verified: true` on the records you have personally checked.

   Nothing here is patient data and nothing here is measured by this
   product. These are published ranges used to constrain a schematic
   simulation.
   ============================================================ */

/**
 * @typedef {object} Param
 * @property {string} id            stable key, referenced from code
 * @property {string} symbol        the symbol used in MICRO_MODE.md
 * @property {number} value         default used by the simulation
 * @property {number} min           lower end of the published range
 * @property {number} max           upper end of the published range
 * @property {string} unit          SI or explicitly stated
 * @property {string} species
 * @property {string} notes
 * @property {object} citation      { key, ref, doi, pmid, verified }
 */

const cite = (key, ref) => ({ key, ref, doi: null, pmid: null, verified: false });

/**
 * The one reference in this table whose DOI is known and printed in the product.
 *
 * It is cited for the *phenomena* the Extended model gestures at — that Ia
 * firing tracks intrafusal force and its rate of change rather than length and
 * velocity alone, and that a recent stretch reduces the response to the next.
 * The constants carrying this key are educational values chosen to make that
 * behaviour visible at this product's scale. None of them is taken from the
 * paper, no code or figure from it has been used, and nothing here reproduces
 * its results.
 */
export const BLUM_2020 = Object.freeze({
  key: 'blum2020',
  authors: 'Blum KP, Horslen MG, Ting LH, et al.',
  year: 2020,
  title: 'Diverse and complex muscle spindle afferent firing properties emerge from multiscale muscle mechanics',
  journal: 'eLife',
  volume: '9',
  article: 'e55177',
  doi: '10.7554/eLife.55177',
  url: 'https://doi.org/10.7554/eLife.55177',
  /* The one citation in this file with a real identifier. It is still marked
     unverified in the records below, because "the DOI is right" and "this
     constant is defensible" are different claims and only the first is checked. */
});

const BLUM =
  'Blum KP et al. (2020) Diverse and complex muscle spindle afferent firing properties emerge from multiscale ' +
  'muscle mechanics. eLife 9:e55177. Cited for the phenomenon, not for this value.';

/** @type {Record<string, Param>} */
export const MICRO_PARAMS = {
  /* ------------------------------------------------------------
     Spindle geometry
     ------------------------------------------------------------ */
  spindleLength: {
    id: 'spindleLength',
    symbol: 'L_spindle',
    value: 6.0,
    min: 3.0,
    max: 10.0,
    unit: 'mm',
    species: 'human',
    notes:
      'Overall length of the encapsulated portion. Sets the drawn scale of the schematic capsule only; the ' +
      'sensory response is driven by fractional length change of the host muscle, not by this number.',
    citation: cite('boyd1976', 'Boyd IA. The response of fast and slow nuclear bag fibres and nuclear chain fibres in isolated cat muscle spindles. (spindle dimensions)'),
  },

  equatorFraction: {
    id: 'equatorFraction',
    symbol: 'f_eq',
    value: 0.3,
    min: 0.2,
    max: 0.4,
    unit: 'dimensionless',
    species: 'human',
    notes:
      'Fraction of the capsule occupied by the equatorial (sensory) region carrying the annulospiral ending. ' +
      'Used to decide which part of the drawn capsule reports length change most strongly.',
    citation: cite('hunt1990', 'Hunt CC. Mammalian muscle spindle: peripheral mechanisms. Physiol Rev.'),
  },

  /* ------------------------------------------------------------
     Ia rate model — Prochazka-style, see MICRO_MODE.md for the equation
     ------------------------------------------------------------ */
  iaRateBias: {
    id: 'iaRateBias',
    symbol: 'r₀',
    value: 50,
    min: 0,
    max: 100,
    unit: 'spikes/s',
    species: 'cat (model fitted); applied to human here',
    notes:
      'Resting/offset discharge. Physiologically this is set by fusimotor (gamma) drive, which this model does ' +
      'not simulate — it is exposed as a bias term instead. Raising it stands in for higher gamma bias.',
    citation: cite('prochazka1999', 'Prochazka A. Quantifying proprioception. Prog Brain Res.'),
  },

  iaVelocityGain: {
    id: 'iaVelocityGain',
    symbol: 'k_v',
    value: 65,
    min: 30,
    max: 100,
    unit: 'spikes/s per (mm/s)^0.5',
    species: 'cat (model fitted); applied to human here',
    notes:
      'Velocity sensitivity of the primary ending. The fractional-power form is what produces the classic ' +
      'asymmetry: strong response to lengthening, near-silence on shortening.',
    citation: cite('prochazka1999', 'Prochazka A. Quantifying proprioception. Prog Brain Res.'),
  },

  iaVelocityExponent: {
    id: 'iaVelocityExponent',
    symbol: 'p',
    value: 0.5,
    min: 0.3,
    max: 0.7,
    unit: 'dimensionless',
    species: 'cat (model fitted)',
    notes: 'Exponent on lengthening velocity. 0.5 is the value in the commonly cited form.',
    citation: cite('prochazka1998', 'Prochazka A, Gorassini M. Ensemble firing of muscle afferents recorded during normal locomotion in cats. J Physiol.'),
  },

  iaLengthGain: {
    id: 'iaLengthGain',
    symbol: 'k_L',
    value: 200,
    min: 50,
    max: 300,
    unit: 'spikes/s per mm',
    species: 'cat (model fitted); applied to human here',
    notes:
      'Static length sensitivity, per millimetre of stretch beyond the reference length. NOTE FOR REVIEW: the ' +
      'published coefficient was fitted to cat medial gastrocnemius over stretches of several millimetres. The ' +
      'sub-millimetre excursions this model produces at rest therefore sit at the very bottom of its fitted ' +
      'range, and the resulting rates should be read as illustrative rather than predictive.',
    citation: cite('prochazka1999', 'Prochazka A. Quantifying proprioception. Prog Brain Res.'),
  },

  iaMaxRate: {
    id: 'iaMaxRate',
    symbol: 'r_max',
    value: 300,
    min: 150,
    max: 500,
    unit: 'spikes/s',
    species: 'human / cat',
    notes: 'Saturating ceiling. Sustained primary-ending rates above this are not observed.',
    citation: cite('matthews1972', 'Matthews PBC. Mammalian Muscle Receptors and Their Central Actions.'),
  },

  iaAdaptationTau: {
    id: 'iaAdaptationTau',
    symbol: 'τ_adapt',
    value: 0.6,
    min: 0.2,
    max: 2.0,
    unit: 's',
    species: 'cat / human',
    notes:
      'Slow adaptation of the static component during a maintained stretch. Implemented as a first-order decay ' +
      'of the length term toward a partially adapted level, not of the velocity term.',
    citation: cite('hunt1990', 'Hunt CC. Mammalian muscle spindle: peripheral mechanisms. Physiol Rev.'),
  },

  iaAdaptationFloor: {
    id: 'iaAdaptationFloor',
    symbol: 'a_∞',
    value: 0.55,
    min: 0.3,
    max: 0.9,
    unit: 'dimensionless',
    species: 'cat / human',
    notes: 'Fraction of the static length response that survives full adaptation. 1.0 would mean no adaptation.',
    citation: cite('hunt1990', 'Hunt CC. Mammalian muscle spindle: peripheral mechanisms. Physiol Rev.'),
  },

  /* ------------------------------------------------------------
     Conduction
     ------------------------------------------------------------ */
  iaConductionVelocity: {
    id: 'iaConductionVelocity',
    symbol: 'v_c',
    value: 90,
    min: 72,
    max: 120,
    unit: 'm/s',
    species: 'human',
    notes:
      'Group Ia (large myelinated, ~12–20 µm) afferent conduction velocity. The min/max are the usual quoted ' +
      'range for human group I fibres; change the value to see arrival timing shift in Micro mode.',
    citation: cite('burke_gandevia', 'Burke D, Gandevia SC. Peripheral motor and sensory nerve conduction (human group I afferent conduction velocity).'),
  },

  iaPathLength: {
    id: 'iaPathLength',
    symbol: 'ℓ',
    value: 0.22,
    min: 0.12,
    max: 0.35,
    unit: 'm',
    species: 'human',
    notes:
      'Conduction distance from a deep suboccipital/upper-cervical muscle spindle to the first central synapse, ' +
      'via the dorsal root. Short compared with a limb afferent, which is why the modelled delay is only a few ' +
      'milliseconds. Approximate: measure against a real anatomical path before quoting it.',
    citation: cite('NEEDS_PRIMARY_SOURCE', 'Anatomical path length — no primary source attached yet. A human must supply one or replace this with a measured value.'),
  },

  synapticDelay: {
    id: 'synapticDelay',
    symbol: 't_syn',
    value: 0.0007,
    min: 0.0003,
    max: 0.0012,
    unit: 's',
    species: 'mammalian',
    notes: 'Monosynaptic delay added after conduction, so the arrival marker is not purely a distance/velocity artefact.',
    citation: cite('NEEDS_PRIMARY_SOURCE', 'Monosynaptic Ia–motoneuron delay — needs a primary source.'),
  },

  /* ------------------------------------------------------------
     Context — not used by the animation, shown in the panel
     ------------------------------------------------------------ */
  suboccipitalSpindleDensity: {
    id: 'suboccipitalSpindleDensity',
    symbol: 'ρ_spindle',
    value: 98,
    min: 40,
    max: 250,
    unit: 'spindles/g',
    species: 'human',
    notes:
      'Documentation only — never read by the simulation. Deep suboccipital muscles carry among the highest ' +
      'spindle densities in the body, which is why this region was chosen as the first ROI. VERIFY THIS NUMBER ' +
      'against the primary source before displaying it as fact.',
    citation: cite('voss1971', 'Voss H. Tabelle der absoluten und relativen Muskelspindelzahlen der menschlichen Skelettmuskulatur. Anat Anz.'),
  },

  /* ------------------------------------------------------------
     Extended model — history, force/yank-style drive, fusimotor
     ------------------------------------------------------------

     Everything below belongs to the *Extended* Microscope model only. The
     Basic model does not read any of it, which is what keeps the product
     default exactly where it was.

     The citation key `blum2020` is attached to the *phenomena* these
     constants parameterise — that Ia firing tracks intrafusal force and its
     yank rather than length and velocity, and that a recent stretch reduces
     the response to the next one. It is NOT a claim that these values appear
     in that paper. They do not. They are educational values chosen so the
     qualitative behaviour is visible at this product's scale, and a human
     must decide whether each is defensible before any of it is published.
     ------------------------------------------------------------ */

  srsYieldDisplacement: {
    id: 'srsYieldDisplacement',
    symbol: 'x_y',
    value: 0.3,
    min: 0.01,
    max: 0.5,
    unit: 'mm',
    species: 'educational value; phenomenon from cat/rat preparations',
    notes:
      'Bond deflection at which the short-range stiffness element yields and begins to slide. Sets how far into a ' +
      'stretch the initial burst lasts. EDUCATIONAL VALUE — not a measured constant.',
    citation: cite('blum2020', BLUM),
  },

  srsGain: {
    id: 'srsGain',
    symbol: 'k_srs',
    value: 60,
    min: 0,
    max: 200,
    unit: 'tension units / mm',
    species: 'educational value',
    notes:
      'Stiffness of the short-range element while its bonds are attached. Much stiffer than the passive path, ' +
      'which is what makes the onset of a stretch far more forceful than its continuation. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  srsRecoveryTau: {
    id: 'srsRecoveryTau',
    symbol: 'tau_rec',
    value: 4.0,
    min: 0.5,
    max: 20,
    unit: 's',
    species: 'educational value; phenomenon reported in the seconds range',
    notes:
      'Time constant for cross-bridge availability to recover after movement has detached it. This is the whole ' +
      'mechanism behind history dependence: it is why a second stretch half a second later is weaker and one ten ' +
      'seconds later is not. EDUCATIONAL VALUE for the constant; the phenomenon is the cited part.',
    citation: cite('blum2020', BLUM),
  },

  srsSlipDistance: {
    id: 'srsSlipDistance',
    symbol: 'x_slip',
    value: 1.2,
    min: 0.05,
    max: 5,
    unit: 'mm',
    species: 'educational value',
    notes:
      'Distance of travel that depletes cross-bridge availability by roughly a factor of e. Breakdown is driven by ' +
      'distance moved rather than by time, which is why a fast small movement and a slow small movement leave the ' +
      'receptor in a similar state. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  passiveStiffness: {
    id: 'passiveStiffness',
    symbol: 'k_pe',
    value: 4.0,
    min: 0,
    max: 60,
    unit: 'tension units / mm',
    species: 'educational value',
    notes:
      'Stiffness of the parallel elastic path, which carries the sustained tension after the short-range element ' +
      'has yielded. Sets the plateau of a hold. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  intrafusalDamping: {
    id: 'intrafusalDamping',
    symbol: 'b_if',
    value: 0,
    min: 0,
    max: 12,
    unit: 'tension units / (mm/s)',
    species: 'educational value',
    notes:
      'Viscous term in the tension proxy. DEFAULT ZERO, and that is a finding rather than a preference: a velocity ' +
      'term inside a quantity that is then differentiated turns every step in velocity into a delta, and at ramp ' +
      'onset that artefact was an order of magnitude larger than the whole yank signal — it buried the history ' +
      'effect completely until it was switched off. Velocity sensitivity is supposed to arrive through yank here. ' +
      'Left as a tunable so the failure can be reproduced. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  tensionGain: {
    id: 'tensionGain',
    symbol: 'g_T',
    value: 2.4,
    min: 0,
    max: 40,
    unit: 'spikes/s per tension unit',
    species: 'educational value',
    notes: 'How much sustained intrafusal tension raises firing. The static half of the Extended drive. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  yankGain: {
    id: 'yankGain',
    symbol: 'g_Y',
    value: 3.2,
    min: 0,
    max: 40,
    unit: 'spikes/s per (tension unit/s)^p_y',
    species: 'educational value',
    notes:
      'How much the rate of change of tension raises firing. This is the term that makes the Extended model respond ' +
      'to how hard a stretch is applied rather than only how far. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  yankExponent: {
    id: 'yankExponent',
    symbol: 'p_y',
    value: 0.6,
    min: 0.3,
    max: 1,
    unit: 'dimensionless',
    species: 'educational value',
    notes:
      'Compressive exponent on the yank term, so a ten-fold faster stretch does not give a ten-fold larger burst. ' +
      'Keeps the response readable across the scenario amplitudes. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  yankTau: {
    id: 'yankTau',
    symbol: 'tau_Y',
    value: 0.012,
    min: 0.002,
    max: 0.1,
    unit: 's',
    species: 'numerical',
    notes:
      'Low-pass on the differentiated tension. Purely numerical: differentiating a signal sampled once per frame ' +
      'produces spikes at frame boundaries that are an artefact of the sampling, not of the receptor.',
    citation: cite('NUMERICAL', 'Implementation constant, not a biological measurement.'),
  },

  gammaStaticGain: {
    id: 'gammaStaticGain',
    symbol: 'G_stat',
    value: 1.1,
    min: 0,
    max: 4,
    unit: 'dimensionless (per unit gamma drive)',
    species: 'educational value; phenomenon well established',
    notes:
      'How strongly static fusimotor drive raises baseline and tension sensitivity. Static gamma drive is modelled ' +
      'as a bias plus a gain on the chain-like channel. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  gammaDynamicGain: {
    id: 'gammaDynamicGain',
    symbol: 'G_dyn',
    value: 0.9,
    min: 0,
    max: 4,
    unit: 'dimensionless (per unit gamma drive)',
    species: 'educational value; phenomenon well established',
    notes:
      'How strongly dynamic fusimotor drive raises the yank sensitivity and the short-range stiffness of the ' +
      'bag-like channel. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  gammaStaticBias: {
    id: 'gammaStaticBias',
    symbol: 'r_gamma',
    value: 26,
    min: 0,
    max: 120,
    unit: 'spikes/s at full static drive',
    species: 'educational value',
    notes: 'Baseline firing added by full static fusimotor drive, independent of any stretch. EDUCATIONAL VALUE.',
    citation: cite('blum2020', BLUM),
  },

  occlusionFactor: {
    id: 'occlusionFactor',
    symbol: 'k_occ',
    value: 0.3,
    min: 0,
    max: 1,
    unit: 'dimensionless',
    species: 'schematic',
    notes:
      'How the bag-like and chain-like channels combine: rate = max(a,b) + k_occ * min(a,b). At 0 the louder ' +
      'channel takes the axon outright, which is the classic occlusion observation; at 1 the two simply sum. ' +
      'SCHEMATIC — a single afferent innervating both fibre types is represented by one number.',
    citation: cite('blum2020', BLUM),
  },

  chainChannelShare: {
    id: 'chainChannelShare',
    symbol: 'w_chain',
    value: 0.45,
    min: 0,
    max: 1,
    unit: 'dimensionless',
    species: 'schematic',
    notes:
      'Share of the drive routed through the static, chain-like channel; the remainder goes to the dynamic, ' +
      'bag-like one. The two differ in which term dominates, not in their equations. SCHEMATIC.',
    citation: cite('blum2020', BLUM),
  },

  /* ------------------------------------------------------------
     Perturbation layer — this product's own modelling assumptions
     ------------------------------------------------------------

     These are NOT literature values and carry no literature citation.
     They parameterise how a mechanical intervention applied in this
     product is assumed to reach the receptor, which is a modelling
     choice made here and nowhere else. The citation key says so.

     The structure mirrors the whole-body afferent model, which already
     treats restriction as a loss of glide that lengthens the tissue
     relaxation time constant. Reusing that shape rather than inventing
     a second one means the micro path and the telemetry path disagree
     about the direction of an effect only if one of them is wrong.
     ------------------------------------------------------------ */

  restrictionTransmission: {
    id: 'restrictionTransmission',
    symbol: 'k_trans',
    value: 0.55,
    min: 0,
    max: 2,
    unit: 'per unit restriction',
    species: 'modelling assumption',
    notes:
      'How much a restriction reduces the excursion that reaches the receptor: transmission = 1/(1 + k_trans·m) for ' +
      'intervention magnitude m. A stiffer parallel path takes a larger share of an imposed movement, so less of it ' +
      'arrives where the ending sits. THIS PRODUCT\'S ASSUMPTION — not measured, not from any paper.',
    citation: cite('REX_MODELLING_ASSUMPTION', 'An explicit modelling assumption of this product\'s perturbation layer. No literature source; not measured.'),
  },

  restrictionLagGain: {
    id: 'restrictionLagGain',
    symbol: 'k_lag',
    value: 26,
    min: 0,
    max: 80,
    unit: 'dimensionless',
    species: 'modelling assumption',
    notes:
      'How much a restriction lengthens the local relaxation time constant: tau = tau_0·(1 + k_lag·m). Deliberately the ' +
      'same gain the whole-body afferent model already uses for viscosity, so the two paths cannot disagree about the ' +
      'direction of the effect. THIS PRODUCT\'S ASSUMPTION.',
    citation: cite('REX_MODELLING_ASSUMPTION', 'An explicit modelling assumption of this product\'s perturbation layer. Mirrors VISCOSITY_GAIN in sim/afferent.js.'),
  },

  restrictionTauBase: {
    id: 'restrictionTauBase',
    symbol: 'tau_0',
    value: 0.0008,
    min: 0.0001,
    max: 0.01,
    unit: 's',
    species: 'modelling assumption',
    notes:
      'Relaxation time constant of healthy tissue in the perturbation model. Same value as TISSUE_TAU in the whole-body ' +
      'afferent model, for the same reason. THIS PRODUCT\'S ASSUMPTION.',
    citation: cite('REX_MODELLING_ASSUMPTION', 'An explicit modelling assumption of this product\'s perturbation layer. Mirrors TISSUE_TAU in sim/afferent.js.'),
  },
};

/** Read a parameter's working value. Throws on a typo rather than yielding NaN. */
export function P(id) {
  const p = MICRO_PARAMS[id];
  if (!p) throw new Error(`[continuum] unknown micro parameter "${id}"`);
  return p.value;
}

/** Clamp a proposed value into the published range, for the tuning controls. */
export function clampParam(id, v) {
  const p = MICRO_PARAMS[id];
  if (!p) return v;
  return Math.min(p.max, Math.max(p.min, v));
}

/** Set a parameter at runtime (tuning). Returns the value actually applied. */
export function setParam(id, v) {
  const p = MICRO_PARAMS[id];
  if (!p || !Number.isFinite(v)) return null;
  p.value = clampParam(id, v);
  return p.value;
}

/** Every parameter, for the panel and for the diagnostics dump. */
export function listParams() {
  return Object.values(MICRO_PARAMS).map((p) => ({ ...p }));
}

/** True when every record has been checked against its primary source. */
export function citationsVerified() {
  return Object.values(MICRO_PARAMS).every((p) => p.citation.verified);
}
