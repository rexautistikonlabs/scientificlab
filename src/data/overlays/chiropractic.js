/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Chiropractic contact-region teaching points.

   What this is: a teaching map of where segmental contact points
   are conventionally taught to sit, bound to the model's own
   anatomy by permanent ID so a student can relate that map to the
   skeleton and to the live mechanical state around each segment.

   What this is NOT: an adjustment guide, an indication for any
   technique, or a claim of clinical effect. There is no adjustment
   animation and no treatment copy anywhere in this product.

   Placement confidence is stated per point. 'textbook-region'
   means the segment or landmark is unambiguous but the exact
   contact placement is schematic on this simplified geometry.
   ============================================================ */

const SRC = 'segmental contact-point teaching convention (schematic placement on simplified geometry)';

const pt = (id, name, anatomicalId, confidence, notes, localOffset = [0, 0, 0], scale = 1) => ({
  id,
  system: 'chiropractic',
  name,
  anatomicalId,
  localOffset,
  source: SRC,
  confidence,
  notes,
  scale,
});

export const CHIROPRACTIC_SET = {
  id: 'chiropractic',
  name: 'Chiropractic contact regions',
  source: SRC,
  caption: 'Teaching atlas. Not an indication. Not a protocol.',
  points: [
    pt('chi-occiput', 'Occipital rim contact', 'BONE_CRANIUM', 'textbook-region',
      'Posterior-inferior cranium at the nuchal line region.', [0, -0.055, -0.055]),
    pt('chi-c1', 'Atlas (C1) transverse contact', 'BONE_VERT_C1', 'textbook-region',
      'Upper cervical segment; short levers, small excursions in the model.'),
    pt('chi-c2', 'Axis (C2) contact', 'BONE_VERT_C2', 'textbook-region',
      'Upper cervical segment below the atlas.'),
    pt('chi-c5', 'Mid-cervical (C5) contact', 'BONE_VERT_C5', 'textbook-region',
      'Mid-cervical articular pillar region.'),
    pt('chi-c7', 'C7 spinous contact', 'BONE_VERT_C7', 'established-landmark',
      'Vertebra prominens — the most palpable cervical spinous process.'),
    pt('chi-t1', 'T1 spinous contact', 'BONE_VERT_T1', 'textbook-region',
      'Cervicothoracic junction segment.'),
    pt('chi-t4', 'T4 transverse contact', 'BONE_VERT_T4', 'textbook-region',
      'Mid-upper thoracic segment; rib articulations share its mechanics.'),
    pt('chi-t7', 'T7 transverse contact', 'BONE_VERT_T7', 'textbook-region',
      'Mid-thoracic segment near the inferior scapular angle level.'),
    pt('chi-t12', 'T12 contact', 'BONE_VERT_T12', 'textbook-region',
      'Thoracolumbar junction — a mechanical transition zone in the model too.'),
    pt('chi-l1', 'L1 mamillary contact', 'BONE_VERT_L1', 'textbook-region',
      'Upper lumbar segment.'),
    pt('chi-l4', 'L4 mamillary contact', 'BONE_VERT_L4', 'established-landmark',
      'At the level of the iliac crest line.'),
    pt('chi-l5', 'L5 contact', 'BONE_VERT_L5', 'textbook-region',
      'Lowest lumbar segment, above the sacral base.'),
    pt('chi-s1', 'Sacral base (S1) contact', 'BONE_VERT_S1', 'textbook-region',
      'Sacral base region.'),
    pt('chi-s3', 'Sacral apex contact', 'BONE_VERT_S3', 'textbook-region',
      'Mid-to-lower sacrum.'),
    pt('chi-ilium-l', 'Ilium contact · L', 'BONE_ILIUM_L', 'established-landmark',
      'Posterior superior iliac spine region, left.', [0, 0.02, -0.03]),
    pt('chi-ilium-r', 'Ilium contact · R', 'BONE_ILIUM_R', 'established-landmark',
      'Posterior superior iliac spine region, right.', [0, 0.02, -0.03]),
    pt('chi-rib1-l', 'First rib contact · L', 'BONE_RIB_1_L', 'textbook-region',
      'Superior thoracic aperture; scalene attachments share this mechanics.'),
    pt('chi-rib1-r', 'First rib contact · R', 'BONE_RIB_1_R', 'textbook-region',
      'Superior thoracic aperture; scalene attachments share this mechanics.'),
  ],
};
