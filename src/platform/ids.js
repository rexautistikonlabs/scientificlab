/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Anatomical identity.

   Every selectable thing in the model carries a permanent, stable
   string ID — BONE_FEMUR_L, MUSCLE_BICEPS_BRACHII_R,
   FASCIA_CERVICAL_DEEP, RECEPTOR_PACINIAN_PLANTAR_01. IDs are the
   platform's join key: properties, live state, research overlays,
   pathology parameter sets and subject data all attach to them, and
   nothing attaches to geometry or materials.

   IDs are *derived*, not authored. The build key already encodes the
   semantics (`bone:femur:L`), so a deterministic transform gives an ID
   that cannot drift when builders are reordered, geometry is retessellated
   or materials change. A frozen manifest hash guards against accidental
   drift; see `manifestSignature`.

   Aliases exist because external data will not always use our spelling.
   Both FASCIA_CERVICAL_DEEP and FASCIA_DEEP_CERVICAL resolve to the same
   structure, and the diaphragm answers to MUSCLE_DIAPHRAGM and
   ORGAN_DIAPHRAGM alike.
   ============================================================ */

/** camelCase / mixed segment → SNAKE_CASE. `bicepsBrachii` → `BICEPS_BRACHII` */
function snake(seg) {
  return String(seg)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/**
 * Canonical ID for a build key.
 * `bone:vert:T4` → `BONE_VERT_T4`
 * `muscle:bicepsBrachii:R` → `MUSCLE_BICEPS_BRACHII_R`
 * `chain:posterior:L` → `CHAIN_POSTERIOR_L`
 */
export function canonicalId(key) {
  return key.split(':').map(snake).filter(Boolean).join('_');
}

/**
 * Alternative spellings that must resolve to the same structure. Keys are
 * aliases, values are canonical IDs. Additive only — never remove an entry,
 * or previously saved projects and external datasets will stop resolving.
 */
export const ALIASES = Object.freeze({
  // conventional adjective-first ordering
  FASCIA_DEEP_CERVICAL: 'FASCIA_CERVICAL_DEEP',
  FASCIA_SUPERFICIAL_TRUNK: 'FASCIA_SUPERFICIAL_TRUNK',
  FASCIA_ABDOMINAL_APONEUROSIS: 'FASCIA_ABDOMINAL_APONEUROSIS',
  /* Settled decision — do not invert. MUSCLE_DIAPHRAGM is canonical because the
     diaphragm is a muscle in this model's layer scheme and its layer membership
     must not change. The wider literature often treats it as an organ-level
     structure, so ORGAN_DIAPHRAGM stays a permanent working alias. */
  ORGAN_DIAPHRAGM: 'MUSCLE_DIAPHRAGM',
  DIAPHRAGM: 'MUSCLE_DIAPHRAGM',
  // common short forms
  BONE_SACRUM: 'BONE_VERT_S1',
  ORGAN_GUT: 'ORGAN_SMALL_INT',
  ORGAN_SMALL_INTESTINE: 'ORGAN_SMALL_INT',
  ORGAN_LARGE_INTESTINE: 'ORGAN_COLON',
  NERVE_SPINAL_CORD: 'NERVE_CORD',
  FASCIA_TLF: 'FASCIA_THORACOLUMBAR',
});

/* ------------------------------------------------------------
   Body regions

   A coarse anatomical region for any world point. Used to name receptor
   instances and to let overlays and pathology sets address a whole region
   rather than enumerating structures.
   ------------------------------------------------------------ */

export const REGION_CODES = [
  'CRANIAL',
  'CERVICAL',
  'THORAX',
  'ABDOMEN',
  'PELVIS',
  'SHOULDER',
  'ARM',
  'FOREARM',
  'HAND',
  'THIGH',
  'LEG',
  'PLANTAR',
  'AXIAL',
];

/**
 * Classify a world position into a region code, with an L/R suffix for
 * paired regions. Thresholds follow the landmark table in anatomy/landmarks.js.
 */
export function bodyRegionAt(x, y, z) {
  const side = x > 0.012 ? 'L' : x < -0.012 ? 'R' : null;
  const ax = Math.abs(x);
  const pair = (code) => (side ? `${code}_${side}` : code);

  // upper limb: lateral of the trunk envelope
  if (ax > 0.155 && y > 0.62 && y < 1.46) {
    if (y > 1.32 && ax < 0.2) return pair('SHOULDER');
    if (y > 1.06) return pair('ARM');
    if (y > 0.83) return pair('FOREARM');
    return pair('HAND');
  }
  if (y < 0.13) return pair('PLANTAR');
  if (y < 0.47) return pair('LEG');
  if (y < 0.9) return pair('THIGH');
  if (y < 1.0) return 'PELVIS';
  if (y < 1.2) return 'ABDOMEN';
  if (y < 1.44) return 'THORAX';
  if (y < 1.56) return 'CERVICAL';
  if (y <= 1.76) return 'CRANIAL';
  return 'AXIAL';
}

/* ------------------------------------------------------------
   Registry of IDs
   ------------------------------------------------------------ */

export class IdRegistry {
  constructor() {
    /** canonical ID → record */
    this.byId = new Map();
    /** build key → canonical ID */
    this.keyToId = new Map();
    /** alias → canonical ID */
    this.alias = new Map(Object.entries(ALIASES));
    this.collisions = [];
  }

  /**
   * Register a structure. `kind` distinguishes selectable structures from
   * receptor instances and other addressable-but-not-pickable entities.
   */
  register(key, { kind = 'structure', layer = null, name = null, region = null, ref = null } = {}) {
    const id = canonicalId(key);
    if (this.byId.has(id)) {
      const prev = this.byId.get(id);
      if (prev.key !== key) this.collisions.push({ id, a: prev.key, b: key });
      return id;
    }
    this.byId.set(id, { id, key, kind, layer, name, region, ref });
    this.keyToId.set(key, id);
    return id;
  }

  /** Resolve an ID or alias (case-insensitive) to its record. */
  resolve(idOrAlias) {
    if (!idOrAlias) return null;
    const up = String(idOrAlias).toUpperCase();
    const direct = this.byId.get(up);
    if (direct) return direct;
    const aliased = this.alias.get(up);
    return aliased ? this.byId.get(aliased) || null : null;
  }

  /** Canonical ID for an ID, alias, or build key. */
  normalise(any) {
    if (!any) return null;
    if (this.keyToId.has(any)) return this.keyToId.get(any);
    const rec = this.resolve(any);
    return rec ? rec.id : null;
  }

  idFor(key) {
    return this.keyToId.get(key) || null;
  }

  keyFor(idOrAlias) {
    return this.resolve(idOrAlias)?.key || null;
  }

  has(idOrAlias) {
    return !!this.resolve(idOrAlias);
  }

  get size() {
    return this.byId.size;
  }

  ids(kind = null) {
    const out = [];
    for (const rec of this.byId.values()) if (!kind || rec.kind === kind) out.push(rec.id);
    return out.sort();
  }

  /**
   * Order-independent signature of the whole ID set. Used by the verification
   * suite to detect accidental identity drift between builds: a change here
   * means saved projects and external datasets may no longer resolve.
   */
  manifestSignature() {
    const ids = this.ids();
    let h = 2166136261;
    for (const id of ids) {
      for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      h ^= 0x2c;
      h = Math.imul(h, 16777619);
    }
    return { count: ids.length, hash: (h >>> 0).toString(16).padStart(8, '0') };
  }

  /** Full manifest, for export / documentation / API surface. */
  manifest() {
    return this.ids().map((id) => {
      const r = this.byId.get(id);
      return { id, kind: r.kind, layer: r.layer, name: r.name, region: r.region };
    });
  }
}
