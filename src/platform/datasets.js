/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Research overlay format — parse and validate.

   A dataset is a flat map from anatomical ID to a value. That is the whole
   contract, and it is deliberately the smallest one that can work: the
   thing an external tool has to produce is a list of names it can look up
   in the manifest, and a number for each. No coordinates, no geometry, no
   knowledge of how the model is built or drawn.

   Because of that, a shear-wave elastography export, a myotonometry
   session, a pressure-algometry sheet and a modelling result all arrive
   the same way, and any of them can be swapped for another without a code
   change. Keys may be a canonical ID, an alias, or a region code, which is
   what lets a dataset authored against different vocabulary still bind.

   Validation is strict about structure and lenient about content: a
   malformed file is rejected with a reason, while unknown IDs are bound as
   far as possible and the remainder *reported*. A dataset that half-binds
   is a data problem the user needs to see, not one to hide.
   ============================================================ */

/** Bump when the format changes incompatibly. */
export const DATASET_SCHEMA = 1;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate and normalise a parsed dataset object.
 *
 * @param {unknown} raw
 * @returns {{ok: true, dataset: object} | {ok: false, reason: string}}
 */
export function validateDataset(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not an object' };
  }
  const d = /** @type {Record<string, any>} */ (raw);

  const version = d.continuumDataset ?? d.schema ?? DATASET_SCHEMA;
  if (typeof version !== 'number' || version > DATASET_SCHEMA) {
    return { ok: false, reason: `dataset format v${version} is newer than this build understands` };
  }
  if (typeof d.id !== 'string' || !d.id.trim()) return { ok: false, reason: 'missing "id"' };
  if (typeof d.name !== 'string' || !d.name.trim()) return { ok: false, reason: 'missing "name"' };
  if (!d.values || typeof d.values !== 'object' || Array.isArray(d.values)) {
    return { ok: false, reason: 'missing "values" object' };
  }

  const field = typeof d.field === 'string' && d.field ? d.field : 'value';

  /* Every entry must resolve to a finite number under `field`, either directly
     or as a member of a record. Anything else is silently useless downstream —
     it would bind, contribute nothing to the range, and paint nothing — so it is
     rejected here where the reason can still be reported. */
  const values = {};
  let numeric = 0;
  for (const [key, v] of Object.entries(d.values)) {
    if (typeof key !== 'string' || !key.trim()) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return { ok: false, reason: `"${key}" is not a finite number` };
      values[key] = v;
      numeric++;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const n = v[field];
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        return { ok: false, reason: `"${key}" has no finite "${field}"` };
      }
      values[key] = v;
      numeric++;
    } else {
      return { ok: false, reason: `"${key}" is neither a number nor a record` };
    }
  }
  if (!numeric) return { ok: false, reason: 'no usable values' };

  const colour = (c, fallback) => (typeof c === 'string' && HEX.test(c) ? c : fallback);

  return {
    ok: true,
    dataset: {
      id: d.id.trim(),
      name: d.name.trim(),
      field,
      unit: typeof d.unit === 'string' ? d.unit : '',
      note: typeof d.note === 'string' ? d.note : '',
      source: typeof d.source === 'string' && d.source ? d.source : 'loaded dataset',
      colorLow: colour(d.colorLow, '#2b6cb0'),
      colorHigh: colour(d.colorHigh, '#ff6f52'),
      values,
    },
  };
}

/** Parse JSON text into a validated dataset. */
export function parseDataset(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  return validateDataset(raw);
}

/**
 * Datasets shipped with the build. Served as ordinary static files rather than
 * bundled, so replacing one is a file copy and adding one needs no rebuild — the
 * same path an institution's own exports will take.
 */
export const BUNDLED_DATASETS = Object.freeze([
  {
    url: 'datasets/shear-modulus-demo.json',
    label: 'Shear modulus (demo)',
    note: 'Synthetic elastography-style export, to demonstrate the format.',
  },
]);

/**
 * Fetch and validate a bundled dataset. Relative to the document, so it works
 * from any subdirectory a static host serves the app from.
 */
export async function fetchDataset(url) {
  let res;
  try {
    res = await fetch(new URL(url, document.baseURI).href, { cache: 'no-cache' });
  } catch (e) {
    return { ok: false, reason: `could not be fetched (${e?.message || 'network error'})` };
  }
  if (!res.ok) return { ok: false, reason: `server returned ${res.status}` };
  return parseDataset(await res.text());
}
