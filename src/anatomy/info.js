/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Mechanical and sensory descriptors.

   This is the educational payload behind every selection: what the
   tissue is made of, how it behaves viscoelastically, which endings
   populate it, which fibre classes carry their traffic and where
   that traffic terminates. Figures are representative ranges from
   the mechanobiology and neurophysiology literature and are used
   here to drive a qualitative model, not to characterise anyone.
   ============================================================ */

/* The six numeric constants per class that the transduction model reads —
   bestHz, threshold, tau, phasic, cvNum and size — are no longer literals here.
   They live in data/afferent_params.js with a unit, a meaning, a range where one
   is stated, a species field and a citation category, because a bare literal
   driving a receptor model is a claim with nothing behind it. The values are
   unchanged; `AP()` throws on an unknown key rather than yielding undefined. */
import { AP } from '../data/afferent_params.js';

/** Mechanoreceptor classes. `tau` values seed the viscoelastic filters. */
export const RECEPTORS = {
  pacinian: {
    id: 'pacinian',
    name: 'Pacinian corpuscle',
    latin: 'corpusculum lamellosum',
    short: 'Pacinian',
    color: '#7ad4ff',
    adapt: 'very rapidly adapting (RA-II)',
    band: '40–400 Hz',
    bestHz: AP('pacinian', 'bestHz'),
    threshold: AP('pacinian', 'threshold'),
    tau: AP('pacinian', 'tau'),
    phasic: AP('pacinian', 'phasic'),
    fiber: 'Aβ',
    group: 'II',
    cv: '35–70 m/s',
    cvNum: AP('pacinian', 'cvNum'),
    target: 'Dorsal column → medial lemniscus',
    size: AP('pacinian', 'size'),
    detects: 'transient acceleration and vibration; effectively blind to sustained load',
    sites: ['subcutis', 'deep fascia', 'periosteum', 'joint capsule', 'mesentery'],
  },
  meissner: {
    id: 'meissner',
    name: 'Meissner corpuscle',
    latin: 'corpusculum tactus',
    short: 'Meissner',
    color: '#8ef0d0',
    adapt: 'rapidly adapting (RA-I)',
    band: '3–50 Hz',
    bestHz: AP('meissner', 'bestHz'),
    threshold: AP('meissner', 'threshold'),
    tau: AP('meissner', 'tau'),
    phasic: AP('meissner', 'phasic'),
    fiber: 'Aβ',
    group: 'II',
    cv: '35–70 m/s',
    cvNum: AP('meissner', 'cvNum'),
    target: 'Dorsal column → medial lemniscus',
    size: AP('meissner', 'size'),
    detects: 'low-frequency flutter and skin slip at the dermal papillae',
    sites: ['dermal papillae', 'glabrous skin'],
  },
  ruffini: {
    id: 'ruffini',
    name: 'Ruffini ending',
    latin: 'corpusculum fusiforme',
    short: 'Ruffini',
    color: '#ffcf6b',
    adapt: 'slowly adapting (SA-II)',
    band: 'DC–8 Hz',
    bestHz: AP('ruffini', 'bestHz'),
    threshold: AP('ruffini', 'threshold'),
    tau: AP('ruffini', 'tau'),
    phasic: AP('ruffini', 'phasic'),
    fiber: 'Aβ',
    group: 'II',
    cv: '35–70 m/s',
    cvNum: AP('ruffini', 'cvNum'),
    target: 'Dorsal column → medial lemniscus',
    size: AP('ruffini', 'size'),
    detects: 'sustained tissue stretch and its direction; a true tension sensor',
    sites: ['dermis', 'deep fascia', 'ligament', 'joint capsule', 'retinacula'],
  },
  free: {
    id: 'free',
    name: 'Free nerve ending',
    latin: 'terminationes nervorum liberae',
    short: 'Free ending',
    color: '#ff8f6a',
    adapt: 'non-adapting, high threshold',
    band: 'DC–30 Hz',
    bestHz: AP('free', 'bestHz'),
    threshold: AP('free', 'threshold'),
    tau: AP('free', 'tau'),
    phasic: AP('free', 'phasic'),
    fiber: 'Aδ / C',
    group: 'III / IV',
    cv: '0.5–30 m/s',
    cvNum: AP('free', 'cvNum'),
    target: 'Anterolateral system → thalamus, insula',
    size: AP('free', 'size'),
    detects: 'sustained pressure, chemical milieu and interstitial state; the most numerous class in fascia',
    sites: ['everywhere — the dominant ending in fascia and periosteum'],
  },
  spindle: {
    id: 'spindle',
    name: 'Muscle spindle',
    latin: 'fusus neuromuscularis',
    short: 'Spindle',
    color: '#c8a4ff',
    adapt: 'primary phasic + secondary tonic',
    band: 'DC–60 Hz',
    bestHz: AP('spindle', 'bestHz'),
    threshold: AP('spindle', 'threshold'),
    tau: AP('spindle', 'tau'),
    phasic: AP('spindle', 'phasic'),
    fiber: 'Ia + II',
    group: 'Ia / II',
    cv: '80–120 m/s',
    cvNum: AP('spindle', 'cvNum'),
    target: 'Dorsal column + spinocerebellar tracts',
    size: AP('spindle', 'size'),
    detects: 'muscle length and rate of change of length, biased by fusimotor drive',
    sites: ['muscle belly, parallel to the fibres'],
  },
  golgi: {
    id: 'golgi',
    name: 'Golgi tendon organ',
    latin: 'organum sensorium tendinis',
    short: 'GTO',
    color: '#ffe08a',
    adapt: 'slowly adapting',
    band: 'DC–20 Hz',
    bestHz: AP('golgi', 'bestHz'),
    threshold: AP('golgi', 'threshold'),
    tau: AP('golgi', 'tau'),
    phasic: AP('golgi', 'phasic'),
    fiber: 'Ib',
    group: 'Ib',
    cv: '70–110 m/s',
    cvNum: AP('golgi', 'cvNum'),
    target: 'Spinocerebellar + segmental inhibition',
    size: AP('golgi', 'size'),
    detects: 'force at the myotendinous junction, in series with the fibres',
    sites: ['myotendinous junction', 'aponeurosis'],
  },
  intero: {
    id: 'intero',
    name: 'Visceral / interoceptive ending',
    latin: 'terminationes interoceptivae',
    short: 'Interoceptive',
    color: '#9fe86b',
    adapt: 'slow, tonic',
    band: 'DC–4 Hz',
    bestHz: AP('intero', 'bestHz'),
    threshold: AP('intero', 'threshold'),
    tau: AP('intero', 'tau'),
    phasic: AP('intero', 'phasic'),
    fiber: 'C / Aδ',
    group: 'IV / III',
    cv: '0.5–2 m/s',
    cvNum: AP('intero', 'cvNum'),
    target: 'Vagal → nucleus tractus solitarii; lamina I → insula',
    size: AP('intero', 'size'),
    detects: 'wall stretch, luminal volume, tension of the mesentery and serosa',
    sites: ['serosa', 'mesentery', 'organ wall', 'vessel adventitia'],
  },
};

export const RECEPTOR_ORDER = ['pacinian', 'meissner', 'ruffini', 'free', 'spindle', 'golgi', 'intero'];

/** Afferent pathway bundles used by the signal system. */
export const PATHWAYS = {
  dorsalColumn: {
    id: 'dorsalColumn',
    name: 'Dorsal column — medial lemniscus',
    carries: 'discriminative touch, vibration, conscious proprioception',
    cv: 45,
    color: '#4fd6e0',
  },
  spinocerebellar: {
    id: 'spinocerebellar',
    name: 'Spinocerebellar tracts',
    carries: 'unconscious proprioception, whole-limb load state',
    cv: 90,
    color: '#a58cff',
  },
  anterolateral: {
    id: 'anterolateral',
    name: 'Anterolateral system',
    carries: 'pressure, thermal and nociceptive traffic, crude touch',
    cv: 8,
    color: '#ff8f6a',
  },
  vagal: {
    id: 'vagal',
    name: 'Vagal afferents',
    carries: 'visceral mechanoreception and chemoreception',
    cv: 2,
    color: '#9fe86b',
  },
  sympathetic: {
    id: 'sympathetic',
    name: 'Spinal visceral afferents',
    carries: 'visceral pressure and distension via the sympathetic chain',
    cv: 3,
    color: '#ffd166',
  },
};

/** Per-layer mechanical defaults. */
export const LAYER_INFO = {
  bone: {
    tissue: 'Mineralised collagen composite',
    modulus: '14–20 GPa',
    tau: 'effectively elastic on physiological timescales',
    role: 'Compression element. Floats within the tension network — it does not stack.',
    stimulus: 'Periosteal strain and vibration',
    receptors: ['pacinian', 'free'],
    pathway: 'dorsalColumn',
  },
  muscle: {
    tissue: 'Striated contractile tissue in a fascial sleeve',
    modulus: '10–50 kPa passive, up to 300 kPa active',
    tau: 'stress-relaxation τ ≈ 1–8 s',
    role: 'The adjustable tensioner of the network; sets baseline pre-stress.',
    stimulus: 'Length change, rate of length change, and developed force',
    receptors: ['spindle', 'golgi', 'free', 'pacinian'],
    pathway: 'spinocerebellar',
  },
  fasciaSup: {
    tissue: 'Loose connective tissue with a high fluid fraction',
    modulus: '2–20 kPa',
    tau: 'creep τ ≈ 8–60 s',
    role: 'Gliding interface. Determines how much skin can shear over deep tissue.',
    stimulus: 'Shear and slow tangential drag',
    receptors: ['ruffini', 'free', 'pacinian'],
    pathway: 'dorsalColumn',
  },
  fasciaDeep: {
    tissue: 'Dense collagen, two to three ordered fibre layers',
    modulus: '20–500 MPa along the dominant fibre direction',
    tau: 'creep τ ≈ 2–20 s',
    role: 'Primary load path. Transmits force between non-adjacent segments.',
    stimulus: 'Tensile strain along fibre, and shear between layers',
    receptors: ['ruffini', 'free', 'pacinian', 'golgi'],
    pathway: 'dorsalColumn',
  },
  chains: {
    tissue: 'Serially continuous myofascial tract',
    modulus: 'composite; governed by the least stiff link',
    tau: 'summed creep τ ≈ 10–60 s',
    role: 'Long-range transmission. Load applied at one end is measurable at the other.',
    stimulus: 'End-to-end tensile load',
    receptors: ['ruffini', 'golgi', 'free'],
    pathway: 'spinocerebellar',
  },
  fasciaVisc: {
    tissue: 'Serous membrane over loose areolar tissue',
    modulus: '1–10 kPa',
    tau: 'creep τ ≈ 20–120 s',
    role: 'Suspends and lubricates the organs; converts organ motion into afferent traffic.',
    stimulus: 'Membrane stretch and sliding pressure',
    receptors: ['intero', 'free', 'pacinian'],
    pathway: 'vagal',
  },
  organ: {
    tissue: 'Parenchyma within a fibro-serous capsule',
    modulus: '0.5–10 kPa',
    tau: 'creep τ ≈ 10–90 s',
    role: 'Pressurised, mobile body. Its position is a tension outcome, not a fixed fact.',
    stimulus: 'Wall tension, luminal volume, capsular stretch',
    receptors: ['intero', 'free'],
    pathway: 'vagal',
  },
  nerve: {
    tissue: 'Axon bundles in perineurium and epineurium',
    modulus: '0.5–15 MPa longitudinal',
    tau: 'conduction degrades above ~6 % sustained strain',
    role: 'The transmission line. Mechanically sensitive along its whole length.',
    stimulus: 'Longitudinal strain, transverse compression, excursion resistance',
    receptors: ['free', 'pacinian'],
    pathway: 'dorsalColumn',
  },
  arterial: {
    tissue: 'Elastic and muscular wall, three tunics',
    modulus: '0.3–1.5 MPa circumferential',
    tau: 'pulse-wave transit ≈ 5–12 m/s',
    role: 'Distributes a pressure wave that is itself a mechanical stimulus to nearby endings.',
    stimulus: 'Circumferential wall stretch, shear at the endothelium',
    receptors: ['intero', 'free'],
    pathway: 'vagal',
  },
  venous: {
    tissue: 'Thin, highly compliant wall with valves',
    modulus: '0.1–0.5 MPa',
    tau: 'collapses under modest external pressure',
    role: 'Return path; the first thing external compression closes.',
    stimulus: 'Distension, external compression, valve competence',
    receptors: ['intero', 'free'],
    pathway: 'sympathetic',
  },
  lymph: {
    tissue: 'Endothelial channels in the interstitial matrix',
    modulus: 'matrix-dominated, 1–8 kPa',
    tau: 'transit is minutes; entirely motion-dependent',
    role: 'Drainage. Driven by tissue motion, respiration and arterial pulse rather than a pump.',
    stimulus: 'Interstitial pressure gradient and cyclic tissue deformation',
    receptors: ['free', 'intero'],
    pathway: 'sympathetic',
  },
  skin: {
    tissue: 'Epidermis, dermal collagen–elastin mesh, subcutaneous fat',
    modulus: '0.1–10 MPa, strongly non-linear',
    tau: 'creep τ ≈ 1–10 s',
    role: 'The outermost sensory sheet and the first tissue any external load meets.',
    stimulus: 'Indentation, stretch, slip, vibration',
    receptors: ['meissner', 'pacinian', 'ruffini', 'free'],
    pathway: 'dorsalColumn',
  },
  receptor: {
    tissue: 'Encapsulated or free sensory ending',
    modulus: 'capsule mechanics set the frequency response',
    tau: 'per class — see the ending description',
    role: 'The transduction site: mechanical energy becomes a train of action potentials.',
    stimulus: 'Whatever the surrounding capsule allows through',
    receptors: [],
    pathway: 'dorsalColumn',
  },
  network: {
    tissue: 'Abstract tension network',
    modulus: 'composite of every element above',
    tau: 'network relaxation τ ≈ 5–40 s',
    role: 'The organising principle: continuous tension, discontinuous compression.',
    stimulus: 'Any change in any element',
    receptors: [],
    pathway: 'spinocerebellar',
  },
};

/**
 * Per-structure overrides, matched by key prefix (longest match wins).
 * Keeps the specific, interesting facts close to the structures they describe.
 */
export const OVERRIDES = {
  'fascia:thoracolumbar': {
    note:
      'A three-layer aponeurotic junction where latissimus, gluteus maximus, the abdominal wall and the erectors all meet. Force entering from any one of them is shared with the others, which is why lumbar load is never a purely lumbar event.',
    receptors: ['ruffini', 'free', 'pacinian', 'golgi'],
  },
  'fascia:cervicalDeep': {
    note:
      'Investing, pretracheal and prevertebral layers form sliding sleeves around the airway, vessels and nerves. Receptor density here is among the highest in the body, and the segment sits directly upstream of head-position sense.',
    receptors: ['ruffini', 'free', 'pacinian', 'spindle'],
  },
  'fascia:plantar': {
    note:
      'The caudal anchor of the posterior line. Loading it raises measurable tension in the hamstrings, the lumbar fascia and the suboccipital tissues — the clearest single demonstration of series continuity.',
    receptors: ['ruffini', 'free', 'pacinian'],
  },
  'muscle:diaphragm': {
    note:
      'Both a respiratory pump and a tensional floor for the mediastinum and roof for the abdomen. Its crura tie breathing directly to the upper lumbar segments.',
    receptors: ['spindle', 'golgi', 'free', 'intero'],
  },
  'muscle:psoas': {
    note:
      'Runs inside the deep front line, in contact with the diaphragm above and the pelvic floor below. Carries lumbar segmental load and lies against the visceral compartment.',
    receptors: ['spindle', 'golgi', 'free'],
  },
  'organ:heart': {
    note:
      'Suspended in the pericardium, which is continuous with the diaphragm below and the cervical fascia above. Every breath moves it, and every change in mediastinal tension changes its filling geometry.',
    receptors: ['intero', 'free', 'pacinian'],
  },
  'organ:smallInt': {
    note:
      'Mesenteric suspension is richly innervated by slow interoceptive afferents. Motility and mesenteric tension together dominate the visceral afferent stream.',
    receptors: ['intero', 'free'],
  },
  'nerve:vagus': {
    note:
      'The principal interoceptive trunk: roughly four fifths of its fibres are afferent. Runs in the carotid sheath through the deep cervical fascia, so cervical mechanical state is directly upstream of visceral sensing.',
    receptors: ['free'],
    pathway: 'vagal',
  },
  'nerve:sciatic': {
    note:
      'The largest peripheral nerve. Needs several millimetres of excursion through its fascial tunnel during hip flexion; when the surrounding tissue loses glide, strain rises before conduction does.',
    receptors: ['free', 'pacinian'],
  },
  'nerve:phrenic': {
    note:
      'C3–C5 to the diaphragm — a long mechanical path through the deep cervical fascia and mediastinum, and the reason cervical and diaphragmatic mechanics are coupled.',
  },
  'bone:sacrum': {
    note:
      'A keystone in tension, not a base in compression: suspended between the ilia by dense ligament that tightens as load rises.',
  },
};

export function overrideFor(key) {
  let best = null;
  let bestLen = -1;
  for (const k in OVERRIDES) {
    if (key.startsWith(k) && k.length > bestLen) {
      best = OVERRIDES[k];
      bestLen = k.length;
    }
  }
  return best;
}

/** Compose the full descriptor the inspector renders. */
export function describe(structure) {
  const base = LAYER_INFO[structure.layer] || LAYER_INFO.network;
  const ov = overrideFor(structure.key) || {};
  const own = structure.info || {};
  const receptors = own.receptors || ov.receptors || base.receptors || [];
  return {
    tissue: own.tissue || ov.tissue || base.tissue,
    modulus: own.modulus || ov.modulus || base.modulus,
    tau: own.tau || ov.tau || base.tau,
    role: own.role || ov.role || base.role,
    stimulus: own.stimulus || ov.stimulus || base.stimulus,
    note: own.note || ov.note || null,
    receptors,
    pathway: PATHWAYS[own.pathway || ov.pathway || base.pathway] || PATHWAYS.dorsalColumn,
    density: own.density || null,
  };
}
