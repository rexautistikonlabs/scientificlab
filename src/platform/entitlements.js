/* ============================================================
   Entitlements — the freemium gate.

   Capability-based rather than tier-conditional: features ask
   `can('scale.deep')`, never `if (tier === 'premium')`. Adding a tier or
   moving a capability between tiers is then a one-line data change, and no
   feature can accidentally ship ungated because it forgot to check a tier
   string.

   Enforcement lives at the source of each capability — the scale manager
   refuses to traverse, the store refuses to add a second selection, the
   tool refuses to arm. The UI's locked states are a courtesy on top of
   that, not the mechanism; disabling a button in the DOM is not a gate.

   The tier comes from an *entitlement claim* — a small record saying who
   holds what, from when, until when, and who said so. `applyClaim` is the
   only way the tier ever changes, which is the seam a real deployment
   plugs into: an auth provider issues a token, a server exchanges it for
   a claim, the client calls applyClaim. Nothing downstream of this file
   knows or cares where the claim came from, so adding real auth and real
   billing does not touch a single capability check.

   Both paths supplied here are mocks: an anonymous licence key, and the
   mock session in `auth.js`. Their output shape is the production shape.
   ============================================================ */

import { Emitter } from '../core/util.js';

/** Every gated capability in the product. */
export const CAPABILITIES = Object.freeze({
  /* --- navigation --- */
  'scale.region': { name: 'Region scale', tiers: ['free', 'premium'] },
  'scale.deep': {
    name: 'Organ, tissue and receptor scales',
    tiers: ['premium'],
    blurb: 'Continuous macro → tissue → receptor traversal, and the receptor micro-anatomy.',
  },
  'camera.freeFly': {
    name: 'Unrestricted camera',
    tiers: ['premium'],
    blurb: 'Pan, deep zoom and cinematic fly-to any structure.',
  },

  /* --- selection --- */
  'select.multi': {
    name: 'Multi-select',
    tiers: ['premium'],
    blurb: 'Combine any number of structures across any systems in one selection.',
  },
  'select.isolate': { name: 'Isolate and hide', tiers: ['premium'] },

  /* --- layers --- */
  'layers.basic': { name: 'Bones, major muscles, organs', tiers: ['free', 'premium'] },
  'layers.advanced': {
    name: 'All tissue layers',
    tiers: ['premium'],
    blurb: 'Superficial, deep and visceral fascia, myofascial lines, nerves, vessels, lymph and receptors.',
  },
  'layers.opacity': { name: 'Per-layer opacity', tiers: ['premium'] },

  /* --- telemetry ---
     The basic strip is deliberately free: seeing the body actually alive and
     globally responsive is what makes the locked instrument worth buying. What
     is gated is the deep read-out — per-receptor bandwidth and latency, the live
     viscoelastic parameters, cross-structure comparison and dataset statistics. */
  'telemetry.basic': { name: 'Live telemetry', tiers: ['free', 'premium'] },
  'telemetry.advanced': {
    name: 'Advanced telemetry',
    tiers: ['premium'],
    blurb:
      'Per-receptor bandwidth and latency, live viscoelastic parameters, left/right comparison and the afferent trace.',
  },

  /* --- visualisation --- */
  'viz.forceColor': { name: 'Tension mapping', tiers: ['premium'], blurb: 'Colour every tissue by its live tension deviation from rest.' },
  'viz.signals': { name: 'Afferent signal streams', tiers: ['premium'] },
  'viz.network': { name: 'Tension network overlay', tiers: ['premium'] },

  /* --- intervention --- */
  'tool.intervention': {
    name: 'Mechanical intervention',
    tiers: ['premium'],
    blurb: 'Apply tension, compression, restriction and shear, and watch force redistribute.',
  },
  'tool.measure': { name: 'Measurement tools', tiers: ['premium'], blurb: 'Distance, tension sampling and signal-fidelity probes.' },
  'tool.annotate': { name: 'Annotations', tiers: ['premium'] },

  /* --- data --- */
  'data.overlays': { name: 'Research overlays', tiers: ['premium'], blurb: 'Paint any ID-keyed dataset onto the model.' },
  'data.pathology': { name: 'Pathology parameter sets', tiers: ['premium'] },
  'data.projects': { name: 'Saved projects', tiers: ['premium'], blurb: 'Save and reload scenes, annotations and measurements.' },
  'data.export': { name: 'Data export', tiers: ['premium'] },

  /* --- physiology --- */
  'physio.advanced': {
    name: 'Full physiology control',
    tiers: ['premium'],
    blurb: 'Tone, motility, breath depth and time-rate control; free tier runs the default resting cycle.',
  },
});

export const TIERS = Object.freeze({
  free: {
    id: 'free',
    name: 'Explorer',
    badge: 'FREE',
    blurb: 'Macro anatomy, major systems, and the living body at whole-body and region scale.',
  },
  premium: {
    id: 'premium',
    name: 'Professional',
    badge: 'PRO',
    blurb: 'Every structure, every scale, every tool — plus overlays, projects and export.',
  },
});

/** Layers a free-tier user may see. Everything else is premium. */
export const FREE_LAYERS = Object.freeze(['bone', 'muscle', 'organ', 'skin']);

/** Deepest scale tier index a free-tier user may reach. */
export const FREE_MAX_TIER = 1;

const STORAGE_KEY = 'continuum.licence.v1';

/**
 * An entitlement claim.
 *
 * @typedef {object} Claim
 * @property {'free'|'premium'} tier
 * @property {string|null} holder     who it was issued to — an email in production
 * @property {string|null} plan       billing plan id, for display and for support
 * @property {string} source          'anonymous' | 'licence-key' | 'session' | 'api'
 * @property {string|null} issued     ISO timestamp
 * @property {string|null} expires    ISO timestamp, or null for no expiry
 */

/** The claim a visitor with no session and no key holds. */
const ANONYMOUS = Object.freeze({
  tier: 'free',
  holder: null,
  plan: null,
  source: 'anonymous',
  issued: null,
  expires: null,
});

function normaliseClaim(c) {
  if (!c || (c.tier !== 'free' && c.tier !== 'premium')) return null;
  return {
    tier: c.tier,
    holder: c.holder ?? null,
    plan: c.plan ?? null,
    source: c.source || 'licence-key',
    issued: c.issued || new Date().toISOString(),
    expires: c.expires ?? null,
  };
}

/** True once an expiry has passed. Checked on read, not on a timer. */
function expired(c) {
  if (!c?.expires) return false;
  const t = Date.parse(c.expires);
  return Number.isFinite(t) && t < Date.now();
}

function readClaim() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normaliseClaim(JSON.parse(raw));
  } catch {
    /* corrupt or unavailable storage falls back to anonymous */
    return null;
  }
}

function writeClaim(c) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* storage may be unavailable; the session still works, it just won't persist */
  }
}

export class Entitlements extends Emitter {
  constructor() {
    super();
    const c = readClaim();
    /** @type {Claim} */
    this.claim = c && !expired(c) ? c : { ...ANONYMOUS };
    /** capabilities blocked this session, for the "what would I get" upsell */
    this.blocked = new Map();
  }

  /** Back-compatible alias — the claim *is* the licence. */
  get licence() {
    return this.claim;
  }

  get tier() {
    // an expired claim degrades on read rather than needing a timer to fire
    if (expired(this.claim)) this._degrade();
    return this.claim.tier;
  }

  _degrade() {
    const prev = this.claim;
    this.claim = { ...ANONYMOUS };
    writeClaim(this.claim);
    this.blocked.clear();
    this.emit('tier', this.claim);
    this.emit('expired', prev);
  }

  get tierInfo() {
    return TIERS[this.tier] || TIERS.free;
  }

  get isPremium() {
    return this.tier === 'premium';
  }

  /** Does the current licence grant this capability? */
  can(cap) {
    const c = CAPABILITIES[cap];
    if (!c) return true; // ungated features are open by construction
    return c.tiers.includes(this.tier);
  }

  /**
   * Gate a capability. Returns true if allowed. If not, records the attempt and
   * emits `blocked` so the UI can surface a targeted upgrade prompt naming the
   * capability the user actually reached for.
   */
  require(cap, context = null) {
    if (this.can(cap)) return true;
    this.blocked.set(cap, (this.blocked.get(cap) || 0) + 1);
    this.emit('blocked', { cap, info: CAPABILITIES[cap], context });
    return false;
  }

  canSeeLayer(layerId) {
    return FREE_LAYERS.includes(layerId) ? true : this.can('layers.advanced');
  }

  maxScaleTier() {
    return this.can('scale.deep') ? 4 : FREE_MAX_TIER;
  }

  /** Capabilities the current tier does not have, for the upgrade dialog. */
  lockedCapabilities() {
    return Object.entries(CAPABILITIES)
      .filter(([, c]) => !c.tiers.includes(this.tier))
      .map(([id, c]) => ({ id, ...c, attempts: this.blocked.get(id) || 0 }))
      .sort((a, b) => b.attempts - a.attempts);
  }

  /**
   * The single way the tier ever changes.
   *
   * This is the production seam. An auth provider issues a token, a server
   * validates it against whatever billing system is in use and returns a claim,
   * and the client calls this. Everything downstream — every `can()`, every
   * `require()`, the scale ceiling, `effectiveOpacity`, every tool — reads the
   * result and none of them know or care how the claim was obtained. Adding real
   * auth and real billing therefore adds no gate logic and changes none.
   *
   * @param {Claim} claim
   * @returns {boolean} true if the effective entitlement changed
   */
  applyClaim(claim) {
    const next = normaliseClaim(claim);
    if (!next) return false;
    if (expired(next)) return false;
    const same =
      next.tier === this.claim.tier &&
      next.holder === this.claim.holder &&
      next.plan === this.claim.plan &&
      next.source === this.claim.source;
    if (same) return false;
    this.claim = next;
    writeClaim(this.claim);
    this.blocked.clear();
    this.emit('tier', this.claim);
    return true;
  }

  /** Convenience wrapper for scripting and for the demo controls. */
  setTier(tier, holder = null, extra = {}) {
    if (!TIERS[tier]) return false;
    return this.applyClaim({ tier, holder, source: 'api', ...extra });
  }

  /**
   * Mock key redemption — the anonymous path, for demos and for offline
   * institutional keys. A real licence server validates the key and returns the
   * same claim shape.
   */
  redeem(key) {
    const k = String(key || '').trim().toUpperCase();
    if (/^(CONTINUUM|PRO)-[A-Z0-9]{4,}$/.test(k) || k === 'DEMO') {
      this.applyClaim({ tier: 'premium', holder: k, plan: 'licence-key', source: 'licence-key' });
      return { ok: true, tier: 'premium' };
    }
    return { ok: false, reason: 'That key was not recognised.' };
  }

  /** Drop back to the anonymous claim. */
  reset() {
    if (this.claim.source === 'anonymous' && this.claim.tier === 'free') return false;
    this.claim = { ...ANONYMOUS };
    writeClaim(this.claim);
    this.blocked.clear();
    this.emit('tier', this.claim);
    return true;
  }
}

export const entitlements = new Entitlements();
