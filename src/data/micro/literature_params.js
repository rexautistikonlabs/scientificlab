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
