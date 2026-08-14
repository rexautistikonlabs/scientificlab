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

   Auth is mocked for the prototype: a licence key in localStorage. The
   shape is deliberately the one a real entitlement service returns, so
   swapping the resolver for a network call touches this file only.
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
 * Mock licence resolver. A real deployment replaces this with a signed token
 * exchange; the return shape is unchanged.
 */
function readLicence() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const l = JSON.parse(raw);
    if (l && (l.tier === 'free' || l.tier === 'premium')) return l;
  } catch {
    /* corrupt or unavailable storage falls back to free */
  }
  return null;
}

function writeLicence(l) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
  } catch {
    /* storage may be unavailable; the session still works, it just won't persist */
  }
}

export class Entitlements extends Emitter {
  constructor() {
    super();
    const l = readLicence();
    this.licence = l || { tier: 'free', holder: null, issued: null };
    /** capabilities blocked this session, for the "what would I get" upsell */
    this.blocked = new Map();
  }

  get tier() {
    return this.licence.tier;
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

  setTier(tier, holder = null) {
    if (!TIERS[tier] || tier === this.licence.tier) return false;
    this.licence = { tier, holder, issued: new Date().toISOString() };
    writeLicence(this.licence);
    this.blocked.clear();
    this.emit('tier', this.licence);
    return true;
  }

  /**
   * Mock key redemption. Anything matching the demo pattern grants Professional;
   * this is the seam a real licence server plugs into.
   */
  redeem(key) {
    const k = String(key || '').trim().toUpperCase();
    if (/^(CONTINUUM|PRO)-[A-Z0-9]{4,}$/.test(k) || k === 'DEMO') {
      this.setTier('premium', k);
      return { ok: true, tier: 'premium' };
    }
    return { ok: false, reason: 'That key was not recognised.' };
  }

  reset() {
    this.setTier('free');
  }
}

export const entitlements = new Entitlements();
