/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Acupuncture atlas teaching points.

   What this is: a teaching map of commonly named atlas points,
   placed approximately on this model's simplified geometry, so a
   student can relate the traditional map to the anatomy underneath.

   What this is NOT: an indication, a protocol, or a claim of
   effect. Point locations here are approximate by construction —
   the model's geometry is schematic, and traditional proportional
   ("cun") measurement does not transfer exactly onto it. Any
   channel line drawn for these points is captioned "schematic
   teaching channel — not a tissue in this model".
   ============================================================ */

const SRC = 'common acupuncture atlas naming; approximate placement on simplified geometry';

const pt = (id, name, anatomicalId, confidence, notes, localOffset = [0, 0, 0], scale = 1) => ({
  id,
  system: 'acupuncture',
  name,
  anatomicalId,
  localOffset,
  source: SRC,
  confidence,
  notes,
  scale,
});

export const ACUPUNCTURE_SET = {
  id: 'acupuncture',
  name: 'Acupuncture atlas points',
  source: SRC,
  caption: 'Teaching atlas. Not an indication. Not a protocol.',
  points: [
    pt('acu-li4-l', 'LI4 · Hegu · L', 'BONE_HAND_L', 'approximate',
      'First dorsal interosseous region of the hand.'),
    pt('acu-li4-r', 'LI4 · Hegu · R', 'BONE_HAND_R', 'approximate',
      'First dorsal interosseous region of the hand.'),
    pt('acu-li11-l', 'LI11 · Quchi · L', 'MUSCLE_FOREARM_EXTENSORS_L', 'approximate',
      'Lateral elbow, at the extensor origin region.', [0, 0.04, 0]),
    pt('acu-li11-r', 'LI11 · Quchi · R', 'MUSCLE_FOREARM_EXTENSORS_R', 'approximate',
      'Lateral elbow, at the extensor origin region.', [0, 0.04, 0]),
    pt('acu-pc6-l', 'PC6 · Neiguan · L', 'MUSCLE_FOREARM_FLEXORS_L', 'approximate',
      'Anterior forearm above the wrist crease, between the flexor tendons.', [0, -0.05, 0.01]),
    pt('acu-pc6-r', 'PC6 · Neiguan · R', 'MUSCLE_FOREARM_FLEXORS_R', 'approximate',
      'Anterior forearm above the wrist crease, between the flexor tendons.', [0, -0.05, 0.01]),
    pt('acu-ht7-l', 'HT7 · Shenmen · L', 'FASCIA_RETINACULUM_WRIST_L', 'approximate',
      'Ulnar wrist crease at the retinaculum.'),
    pt('acu-ht7-r', 'HT7 · Shenmen · R', 'FASCIA_RETINACULUM_WRIST_R', 'approximate',
      'Ulnar wrist crease at the retinaculum.'),
    pt('acu-st36-l', 'ST36 · Zusanli · L', 'MUSCLE_TIBIALIS_ANT_L', 'approximate',
      'Below the knee, lateral to the tibial crest.', [0, 0.06, 0]),
    pt('acu-st36-r', 'ST36 · Zusanli · R', 'MUSCLE_TIBIALIS_ANT_R', 'approximate',
      'Below the knee, lateral to the tibial crest.', [0, 0.06, 0]),
    pt('acu-sp6-l', 'SP6 · Sanyinjiao · L', 'BONE_TIBIA_L', 'approximate',
      'Medial leg above the malleolus, posterior to the tibial border.', [0.01, -0.12, 0]),
    pt('acu-sp6-r', 'SP6 · Sanyinjiao · R', 'BONE_TIBIA_R', 'approximate',
      'Medial leg above the malleolus, posterior to the tibial border.', [-0.01, -0.12, 0]),
    pt('acu-bl40-l', 'BL40 · Weizhong · L', 'MUSCLE_HAMSTRINGS_L', 'approximate',
      'Centre of the popliteal crease.', [0, -0.16, -0.01]),
    pt('acu-bl40-r', 'BL40 · Weizhong · R', 'MUSCLE_HAMSTRINGS_R', 'approximate',
      'Centre of the popliteal crease.', [0, -0.16, -0.01]),
    pt('acu-ki1-l', 'KI1 · Yongquan · L', 'FASCIA_PLANTAR_L', 'approximate',
      'Anterior third of the sole.'),
    pt('acu-ki1-r', 'KI1 · Yongquan · R', 'FASCIA_PLANTAR_R', 'approximate',
      'Anterior third of the sole.'),
    pt('acu-gb20-l', 'GB20 · Fengchi · L', 'MUSCLE_SPLENIUS_L', 'approximate',
      'Below the occiput, in the suboccipital hollow.', [0, 0.03, -0.01]),
    pt('acu-gb20-r', 'GB20 · Fengchi · R', 'MUSCLE_SPLENIUS_R', 'approximate',
      'Below the occiput, in the suboccipital hollow.', [0, 0.03, -0.01]),
    pt('acu-gb21-l', 'GB21 · Jianjing · L', 'MUSCLE_TRAPEZIUS_L', 'approximate',
      'Highest point of the shoulder line.', [0, 0.06, 0]),
    pt('acu-gb21-r', 'GB21 · Jianjing · R', 'MUSCLE_TRAPEZIUS_R', 'approximate',
      'Highest point of the shoulder line.', [0, 0.06, 0]),
    pt('acu-gv20', 'GV20 · Baihui', 'BONE_CRANIUM', 'approximate',
      'Vertex of the cranium.', [0, 0.09, 0]),
    pt('acu-bl23-l', 'BL23 · Shenshu · L', 'MUSCLE_ERECTOR_SPINAE_L', 'approximate',
      'Lumbar erector column at the L2 level.', [0, -0.28, 0]),
    pt('acu-bl23-r', 'BL23 · Shenshu · R', 'MUSCLE_ERECTOR_SPINAE_R', 'approximate',
      'Lumbar erector column at the L2 level.', [0, -0.28, 0]),
    pt('acu-cv12', 'CV12 · Zhongwan', 'FASCIA_ABDOMINAL_APONEUROSIS', 'approximate',
      'Midline epigastrium, halfway between umbilicus and sternum.', [0, 0.06, 0.01]),
  ],
};
