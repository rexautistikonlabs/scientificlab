/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Provenance for the whole-body afferent constants.

   Every number in `anatomy/info.js` that the transduction model reads
   used to be a bare literal: no unit, no range, no species, no source.
   The micro path built later has all of those for every constant, so
   the older and far more visible module was the weaker one — the
   validation matrix said so, and this file is the answer to it.

   ── WHAT THIS FILE DOES AND DOES NOT DO ────────────────────────
   It records what each number *is*. It does not make any of them
   better sourced than they are, and it does not change a single
   value: `anatomy/info.js` now reads from here, and a check asserts
   the runtime numbers are identical to before. Provenance, not
   retuning.

   ── THE HONEST SPLIT ───────────────────────────────────────────
   Writing this down forced the classification that matters, and it
   is not flattering:

     21 of 42 are MODEL_TUNING — tau, threshold and phasic for every
     class. These were chosen so each class behaves qualitatively as
     its adaptation label describes. They have no literature source,
     and `threshold` is in the engine's own normalised load units,
     which have no physical scale at all.

     21 of 42 sit inside a textbook-consensus range — the frequency
     band, the conduction velocity, the ending's size. The *range* is
     the citable part; the specific point value inside it is still a
     choice nobody sourced.

   So: none of these is verified, and the two groups are unverified in
   different ways. Pretending otherwise by giving all 42 a plausible
   reference would have been worse than the bare literals were.

   ── HOW TO VERIFY A ROW ────────────────────────────────────────
   See AFFERENT_PARAMS.md. Short version: find the primary source,
   check the value is inside what it reports, fill in `doi`, and set
   `verified: true` on that record alone. Never in bulk.
   ============================================================ */

/**
 * Citation categories. These are honest labels for *kinds* of grounding, not
 * references — a category is not a source, and none of these is one.
 */
export const AFFERENT_CITATIONS = Object.freeze({
  TEXTBOOK_CONSENSUS_BAND: {
    key: 'TEXTBOOK_CONSENSUS_BAND',
    doi: null,
    what: 'The frequency band this receptor class responds over is textbook consensus; the specific centre frequency used here is not sourced.',
  },
  TEXTBOOK_CONSENSUS_CV: {
    key: 'TEXTBOOK_CONSENSUS_CV',
    doi: null,
    what: 'The conduction-velocity range for this fibre class is textbook consensus; the specific point value used here is not sourced.',
  },
  TEXTBOOK_CONSENSUS_SIZE: {
    key: 'TEXTBOOK_CONSENSUS_SIZE',
    doi: null,
    what: 'Order-of-magnitude dimension of the ending. Drives drawing only; the transduction model never reads it.',
  },
  MODEL_TUNING: {
    key: 'MODEL_TUNING',
    doi: null,
    what: 'Chosen so the model behaves qualitatively as described. No literature source, nothing measured, and in some cases no physical unit.',
  },
});

/**
 * @typedef {object} AfferentParam
 * @property {string} id                 `class.param`
 * @property {string} receptorClass
 * @property {string} className
 * @property {string} param
 * @property {number} value              the number the simulation uses
 * @property {string} unit
 * @property {string} biologicalMeaning
 * @property {'human'|'animal'|'model'|'unspecified'} species
 * @property {[number,number]|null} range
 * @property {{key:string, doi:string|null, verified:boolean}} citation
 * @property {string} notes
 */

/** @type {Record<string, AfferentParam>} */
export const AFFERENT_PARAMS = {
  'pacinian.bestHz': {
    id: 'pacinian.bestHz',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'bestHz',
    value: 180,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [40, 400],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: 40–400 Hz.',
  },
  'pacinian.threshold': {
    id: 'pacinian.threshold',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'threshold',
    value: 0.06,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'pacinian.tau': {
    id: 'pacinian.tau',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'tau',
    value: 0.006,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'pacinian.phasic': {
    id: 'pacinian.phasic',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'phasic',
    value: 0.97,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'pacinian.cvNum': {
    id: 'pacinian.cvNum',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'cvNum',
    value: 52,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [35, 70],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 35–70 m/s.',
  },
  'pacinian.size': {
    id: 'pacinian.size',
    receptorClass: 'pacinian',
    className: 'Pacinian corpuscle',
    param: 'size',
    value: 0.001,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'meissner.bestHz': {
    id: 'meissner.bestHz',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'bestHz',
    value: 30,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [3, 50],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: 3–50 Hz.',
  },
  'meissner.threshold': {
    id: 'meissner.threshold',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'threshold',
    value: 0.04,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'meissner.tau': {
    id: 'meissner.tau',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'tau',
    value: 0.03,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'meissner.phasic': {
    id: 'meissner.phasic',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'phasic',
    value: 0.85,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'meissner.cvNum': {
    id: 'meissner.cvNum',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'cvNum',
    value: 48,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [35, 70],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 35–70 m/s.',
  },
  'meissner.size': {
    id: 'meissner.size',
    receptorClass: 'meissner',
    className: 'Meissner corpuscle',
    param: 'size',
    value: 0.00015,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'ruffini.bestHz': {
    id: 'ruffini.bestHz',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'bestHz',
    value: 1.5,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [0, 8],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: DC–8 Hz.',
  },
  'ruffini.threshold': {
    id: 'ruffini.threshold',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'threshold',
    value: 0.08,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'ruffini.tau': {
    id: 'ruffini.tau',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'tau',
    value: 0.9,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'ruffini.phasic': {
    id: 'ruffini.phasic',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'phasic',
    value: 0.18,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'ruffini.cvNum': {
    id: 'ruffini.cvNum',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'cvNum',
    value: 45,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [35, 70],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 35–70 m/s.',
  },
  'ruffini.size': {
    id: 'ruffini.size',
    receptorClass: 'ruffini',
    className: 'Ruffini ending',
    param: 'size',
    value: 0.0005,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'free.bestHz': {
    id: 'free.bestHz',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'bestHz',
    value: 0.6,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [0, 30],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: DC–30 Hz.',
  },
  'free.threshold': {
    id: 'free.threshold',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'threshold',
    value: 0.22,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'free.tau': {
    id: 'free.tau',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'tau',
    value: 1.6,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'free.phasic': {
    id: 'free.phasic',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'phasic',
    value: 0.1,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'free.cvNum': {
    id: 'free.cvNum',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'cvNum',
    value: 6,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [0.5, 30],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 0.5–30 m/s.',
  },
  'free.size': {
    id: 'free.size',
    receptorClass: 'free',
    className: 'Free nerve ending',
    param: 'size',
    value: 8e-05,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'spindle.bestHz': {
    id: 'spindle.bestHz',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'bestHz',
    value: 12,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [0, 60],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: DC–60 Hz.',
  },
  'spindle.threshold': {
    id: 'spindle.threshold',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'threshold',
    value: 0.03,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'spindle.tau': {
    id: 'spindle.tau',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'tau',
    value: 0.05,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'spindle.phasic': {
    id: 'spindle.phasic',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'phasic',
    value: 0.6,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'spindle.cvNum': {
    id: 'spindle.cvNum',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'cvNum',
    value: 95,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [80, 120],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 80–120 m/s.',
  },
  'spindle.size': {
    id: 'spindle.size',
    receptorClass: 'spindle',
    className: 'Muscle spindle',
    param: 'size',
    value: 0.006,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'golgi.bestHz': {
    id: 'golgi.bestHz',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'bestHz',
    value: 3,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [0, 20],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: DC–20 Hz.',
  },
  'golgi.threshold': {
    id: 'golgi.threshold',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'threshold',
    value: 0.05,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'golgi.tau': {
    id: 'golgi.tau',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'tau',
    value: 0.28,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'golgi.phasic': {
    id: 'golgi.phasic',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'phasic',
    value: 0.3,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'golgi.cvNum': {
    id: 'golgi.cvNum',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'cvNum',
    value: 88,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [70, 110],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 70–110 m/s.',
  },
  'golgi.size': {
    id: 'golgi.size',
    receptorClass: 'golgi',
    className: 'Golgi tendon organ',
    param: 'size',
    value: 0.001,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
  'intero.bestHz': {
    id: 'intero.bestHz',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'bestHz',
    value: 0.4,
    unit: 'Hz',
    biologicalMeaning: 'Centre of the band this class is modelled to resolve best; sets its rate ceiling and its bandwidth denominator.',
    species: 'unspecified',
    range: [0, 4],
    citation: { key: 'TEXTBOOK_CONSENSUS_BAND', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class band stated below. The band is textbook consensus; this particular centre value is not sourced. Stated class range: DC–4 Hz.',
  },
  'intero.threshold': {
    id: 'intero.threshold',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'threshold',
    value: 0.12,
    unit: 'normalised load (0–1)',
    biologicalMeaning: 'Normalised stimulus below which this class does not respond.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE in the engine’s own normalised load units, which have no physical scale. Not convertible to a force or a displacement without a calibration this product does not have.',
  },
  'intero.tau': {
    id: 'intero.tau',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'tau',
    value: 2.4,
    unit: 's',
    biologicalMeaning: 'Adaptation time constant of the class transducer — how fast its response to a held stimulus decays.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE. Chosen so the class behaves qualitatively as its adaptation label describes. No literature source; not measured.',
  },
  'intero.phasic': {
    id: 'intero.phasic',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'phasic',
    value: 0.12,
    unit: 'dimensionless (0–1)',
    biologicalMeaning: 'Share of the drive taken from the rate of change of the stimulus rather than its level.',
    species: 'model',
    range: null,
    citation: { key: 'MODEL_TUNING', doi: null, verified: false },
    notes: 'MODEL TUNING VALUE encoding the class’s rapidly- vs slowly-adapting character as one number. No literature source.',
  },
  'intero.cvNum': {
    id: 'intero.cvNum',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'cvNum',
    value: 1.2,
    unit: 'm/s',
    biologicalMeaning: 'Conduction velocity used for the afferent delay of this class.',
    species: 'unspecified',
    range: [0.5, 2],
    citation: { key: 'TEXTBOOK_CONSENSUS_CV', doi: null, verified: false },
    notes: 'Legacy literal chosen inside the class conduction-velocity range stated below. The range is textbook consensus; the point value is not sourced. Stated class range: 0.5–2 m/s.',
  },
  'intero.size': {
    id: 'intero.size',
    receptorClass: 'intero',
    className: 'Visceral / interoceptive ending',
    param: 'size',
    value: 0.0002,
    unit: 'm',
    biologicalMeaning: 'Characteristic dimension of the ending, used for drawing it and for the micro-anatomy handover.',
    species: 'unspecified',
    range: null,
    citation: { key: 'TEXTBOOK_CONSENSUS_SIZE', doi: null, verified: false },
    notes: 'Order-of-magnitude figure. Drives geometry only; the transduction model never reads it.',
  },
};

/**
 * Read a value. Throws on a typo rather than returning undefined and letting a
 * NaN travel silently into the transduction model — the same rule the micro
 * parameter table uses.
 */
export function AP(receptorClass, param) {
  const rec = AFFERENT_PARAMS[`${receptorClass}.${param}`];
  if (!rec) throw new Error(`[continuum] unknown afferent parameter "${receptorClass}.${param}"`);
  return rec.value;
}

/** Every record, for the inspector, the docs and the verification checklist. */
export function listAfferentParams() {
  return Object.values(AFFERENT_PARAMS).map((p) => ({ ...p, citation: { ...p.citation } }));
}

/** Every record for one receptor class. */
export function paramsForClass(receptorClass) {
  return listAfferentParams().filter((p) => p.receptorClass === receptorClass);
}

/**
 * Counts by citation category, and how many are verified.
 *
 * The headline this is here to keep visible: `verified` is 0, and it should
 * only ever move one record at a time, by a human who read the paper.
 */
export function provenanceSummary() {
  const byCategory = {};
  let verified = 0;
  let withRange = 0;
  for (const p of Object.values(AFFERENT_PARAMS)) {
    byCategory[p.citation.key] = (byCategory[p.citation.key] ?? 0) + 1;
    if (p.citation.verified) verified++;
    if (p.range) withRange++;
  }
  return { total: Object.keys(AFFERENT_PARAMS).length, byCategory, verified, withRange };
}

/** True only when every record has been checked against a primary source. */
export function afferentCitationsVerified() {
  return Object.values(AFFERENT_PARAMS).every((p) => p.citation.verified);
}

/**
 * Records whose stated value falls outside their own stated range.
 * Empty is the only acceptable answer; a non-empty result means the table and
 * the class description disagree about the same receptor.
 */
export function rangeViolations() {
  return listAfferentParams()
    .filter((p) => p.range && (p.value < p.range[0] || p.value > p.range[1]))
    .map((p) => ({ id: p.id, value: p.value, range: p.range }));
}
