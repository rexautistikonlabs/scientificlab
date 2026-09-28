/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Anatomical teaching figures — female and male.

   Two selectable figures, differing where gross anatomy differs and
   the procedural builders can express it: pelvis flare and pubic
   arch, femoral bow, pectoral and breast volume, pelvic-floor span,
   and reproductive viscera presence.

   What this is NOT, by design:

     · No sex-specific firing rates, restriction scalars, tissue
       time constants or "conducts differently" numbers exist
       anywhere. The afferent, efferent and physiology models are
       IDENTICAL for both figures.
     · The tension network, its landmarks and its node positions
       are SHARED — both figures solve on the same mechanics, so
       every published demonstration number holds on both.
     · These are anatomical teaching figures, not a claim about sex
       differences in any research construct.

   Structures unique to one figure exist only in that figure's ID
   manifest (ORGAN_UTERUS, ORGAN_OVARY_L/R, SKIN_BREAST_L/R on the
   female; ORGAN_PROSTATE on the male); shared structures keep the
   same IDs on both, so datasets and overlays keyed to shared
   anatomy resolve identically. Anything keyed to a structure the
   current figure lacks reports as unresolved — never snapped to a
   different landmark.

   The figure is chosen once per session (geometry is built at
   boot); switching triggers a rebuild via reload, exactly like the
   quality tier's geometry rebuild.
   ============================================================ */

export const FIGURE_KEY = 'continuum_figure';

export const FIGURES = {
  female: {
    id: 'female',
    label: 'Female',
    /* pelvis: broader flare, wider pubic arch and outlet */
    pelvisFlare: 1.12,
    pubicWiden: 1.14,
    /* slightly greater femoral bow (a gross Q-angle cue, drawn geometry only —
       hip and knee joints stay on the shared network landmarks) */
    femurBow: 1.0,
    femurBowExtra: 0.006,
    pectoral: 1.0,
    breasts: true,
    pelvicFloorSpan: 1.12,
    viscera: 'female',
  },
  male: {
    id: 'male',
    label: 'Male',
    pelvisFlare: 1.0,
    pubicWiden: 1.0,
    femurBow: 1.0,
    femurBowExtra: 0,
    pectoral: 1.16,
    breasts: false,
    pelvicFloorSpan: 1.0,
    viscera: 'male',
  },
};

export function currentFigureId() {
  try {
    const v = localStorage.getItem(FIGURE_KEY);
    if (v === 'male' || v === 'female') return v;
  } catch {
    /* storage unavailable → default */
  }
  return 'female';
}

export function setFigureId(id) {
  if (!FIGURES[id]) return false;
  try {
    localStorage.setItem(FIGURE_KEY, id);
  } catch {
    /* fine — the choice just does not persist */
  }
  return true;
}

/** The figure this session is built as. Resolved once, at module load. */
export const FIG = FIGURES[currentFigureId()];
