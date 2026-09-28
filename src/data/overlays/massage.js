/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Massage / myofascial landmark teaching points.

   What this is: the regions manual-therapy teaching commonly names
   — suboccipitals, masseter, upper trapezius / levator, lumbar
   erectors, iliacus/psoas region, plantar fascia, pelvic floor —
   bound to the model's anatomy so a student can see the landmark,
   the tissue class it lives on, and the live mechanical state
   around it.

   What this is NOT: treatment guidance. Selecting a landmark can
   apply a TEMPORARY, clearly-labelled restriction through the same
   intervention path the manual tools use — a physics demonstration
   on the model, removed by one click, and not a representation of
   any procedure or its outcome.
   ============================================================ */

const SRC = 'common myofascial teaching landmarks (schematic placement on simplified geometry)';

const pt = (id, name, anatomicalId, confidence, notes, localOffset = [0, 0, 0], scale = 1) => ({
  id,
  system: 'massage',
  name,
  anatomicalId,
  localOffset,
  source: SRC,
  confidence,
  notes,
  scale,
});

export const MASSAGE_SET = {
  id: 'massage',
  name: 'Massage / myofascial landmarks',
  source: SRC,
  caption: 'Teaching atlas. Not an indication. Not a protocol.',
  points: [
    pt('mas-suboccipital', 'Suboccipital group', 'FASCIA_NUCHAL', 'established-landmark',
      'Deep to the nuchal fascia at the skull base; described as spindle-dense in the literature.', [0, 0.05, 0]),
    pt('mas-masseter-l', 'Masseter region · L', 'BONE_MANDIBLE', 'textbook-region',
      'Over the mandibular ramus, left.', [0.045, 0.01, 0.01]),
    pt('mas-masseter-r', 'Masseter region · R', 'BONE_MANDIBLE', 'textbook-region',
      'Over the mandibular ramus, right.', [-0.045, 0.01, 0.01]),
    pt('mas-uppertrap-l', 'Upper trapezius / levator · L', 'MUSCLE_TRAPEZIUS_L', 'established-landmark',
      'Shoulder line between neck and acromion.', [0, 0.05, 0]),
    pt('mas-uppertrap-r', 'Upper trapezius / levator · R', 'MUSCLE_TRAPEZIUS_R', 'established-landmark',
      'Shoulder line between neck and acromion.', [0, 0.05, 0]),
    pt('mas-scm-l', 'Sternocleidomastoid · L', 'MUSCLE_SCM_L', 'established-landmark',
      'Anterolateral neck, mastoid to clavicle.'),
    pt('mas-scm-r', 'Sternocleidomastoid · R', 'MUSCLE_SCM_R', 'established-landmark',
      'Anterolateral neck, mastoid to clavicle.'),
    pt('mas-scalene-l', 'Scalene group · L', 'MUSCLE_SCALENE_L', 'textbook-region',
      'Lateral neck, first-rib attachments.'),
    pt('mas-scalene-r', 'Scalene group · R', 'MUSCLE_SCALENE_R', 'textbook-region',
      'Lateral neck, first-rib attachments.'),
    pt('mas-rhomboid-l', 'Rhomboid / mid-trap · L', 'MUSCLE_RHOMBOID_L', 'textbook-region',
      'Between the scapula and the thoracic spine.'),
    pt('mas-rhomboid-r', 'Rhomboid / mid-trap · R', 'MUSCLE_RHOMBOID_R', 'textbook-region',
      'Between the scapula and the thoracic spine.'),
    pt('mas-erector-l', 'Lumbar erector column · L', 'MUSCLE_ERECTOR_SPINAE_L', 'established-landmark',
      'Paraspinal column at the lumbar levels.', [0, -0.3, 0]),
    pt('mas-erector-r', 'Lumbar erector column · R', 'MUSCLE_ERECTOR_SPINAE_R', 'established-landmark',
      'Paraspinal column at the lumbar levels.', [0, -0.3, 0]),
    pt('mas-ql-l', 'Quadratus lumborum · L', 'MUSCLE_QUADRATUS_LUMBORUM_L', 'textbook-region',
      'Between the twelfth rib and the iliac crest.'),
    pt('mas-ql-r', 'Quadratus lumborum · R', 'MUSCLE_QUADRATUS_LUMBORUM_R', 'textbook-region',
      'Between the twelfth rib and the iliac crest.'),
    pt('mas-tlf', 'Thoracolumbar fascia', 'FASCIA_THORACOLUMBAR', 'established-landmark',
      'The broad lumbar aponeurosis — a major force-transmission sheet in the model.'),
    pt('mas-psoas-l', 'Iliacus / psoas region · L', 'MUSCLE_PSOAS_L', 'textbook-region',
      'Deep anterior hip flexor compartment.'),
    pt('mas-psoas-r', 'Iliacus / psoas region · R', 'MUSCLE_PSOAS_R', 'textbook-region',
      'Deep anterior hip flexor compartment.'),
    pt('mas-pelvicfloor', 'Pelvic floor', 'MUSCLE_PELVIC_FLOOR', 'textbook-region',
      'The pelvic diaphragm; modelled as one sheet.'),
    pt('mas-glutmed-l', 'Gluteus medius · L', 'MUSCLE_GLUTEAL_MED_L', 'textbook-region',
      'Lateral hip abductor field.'),
    pt('mas-glutmed-r', 'Gluteus medius · R', 'MUSCLE_GLUTEAL_MED_R', 'textbook-region',
      'Lateral hip abductor field.'),
    pt('mas-itb-l', 'Iliotibial band · L', 'FASCIA_LATA_L', 'established-landmark',
      'Lateral thigh fascial band.'),
    pt('mas-itb-r', 'Iliotibial band · R', 'FASCIA_LATA_R', 'established-landmark',
      'Lateral thigh fascial band.'),
    pt('mas-gastroc-l', 'Gastrocnemius / soleus · L', 'MUSCLE_GASTROC_L', 'established-landmark',
      'Posterior calf mass.'),
    pt('mas-gastroc-r', 'Gastrocnemius / soleus · R', 'MUSCLE_GASTROC_R', 'established-landmark',
      'Posterior calf mass.'),
    pt('mas-plantar-l', 'Plantar fascia · L', 'FASCIA_PLANTAR_L', 'established-landmark',
      'The sole’s aponeurosis — the classic continuity demonstration in this model.'),
    pt('mas-plantar-r', 'Plantar fascia · R', 'FASCIA_PLANTAR_R', 'established-landmark',
      'The sole’s aponeurosis — the classic continuity demonstration in this model.'),
  ],
};
