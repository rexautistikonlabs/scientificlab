/* ============================================================
   Central application state. Everything the UI shows and every
   knob the simulation reads lives here, so panels, viewport and
   solvers never need to know about each other.
   ============================================================ */

import { Emitter, clamp } from './util.js';
import { entitlements } from '../platform/entitlements.js';

/** Ordered layer definitions — this array drives the systems panel. */
export const LAYERS = [
  {
    id: 'skin',
    name: 'Skin & subcutis',
    color: '#d8a184',
    opacity: 0.16,
    visible: true,
    blurb: 'Epidermis, dermis and the subcutaneous fat pad — the outermost sensory sheet.',
  },
  {
    id: 'fasciaSup',
    name: 'Superficial fascia',
    color: '#79e6cf',
    opacity: 0.15,
    visible: true,
    blurb: 'The loose, fluid-rich gliding membrane that lets skin shear over deep tissue.',
  },
  {
    id: 'fasciaDeep',
    name: 'Deep fascia',
    color: '#4fd6e0',
    opacity: 0.5,
    visible: true,
    blurb: 'Dense investing sheets and septa: the primary load-bearing tension fabric.',
  },
  {
    id: 'chains',
    name: 'Myofascial lines',
    color: '#2fe8c8',
    opacity: 0.58,
    visible: true,
    blurb: 'Long-range force-transmitting paths that link segments end to end.',
  },
  {
    id: 'fasciaVisc',
    name: 'Visceral fascia',
    color: '#78c0ff',
    opacity: 0.34,
    visible: false,
    blurb: 'Pericardium, pleura, peritoneum and mesentery — the organ suspension system.',
  },
  {
    id: 'muscle',
    name: 'Muscle',
    color: '#c74a52',
    opacity: 0.9,
    visible: true,
    blurb: 'Contractile tissue pre-tensioning the network; the source of active tone.',
  },
  {
    id: 'bone',
    name: 'Bone',
    color: '#e9dfc6',
    opacity: 1,
    visible: true,
    blurb: 'Discontinuous compression elements floating within the tension network.',
  },
  {
    id: 'organ',
    name: 'Organs & viscera',
    color: '#d4796a',
    opacity: 0.82,
    visible: true,
    blurb: 'Pressurised, mobile bodies whose position depends on surrounding tension.',
  },
  {
    id: 'nerve',
    name: 'Nerves & pathways',
    color: '#f0b429',
    opacity: 0.95,
    visible: true,
    blurb: 'Peripheral nerves, plexuses, roots, cord and ascending afferent tracts.',
  },
  {
    id: 'arterial',
    name: 'Arterial tree',
    color: '#e8506b',
    opacity: 0.85,
    visible: false,
    blurb: 'Pulsatile pressure distribution; a mechanical stimulus in its own right.',
  },
  {
    id: 'venous',
    name: 'Venous return',
    color: '#5b83d6',
    opacity: 0.8,
    visible: false,
    blurb: 'Low-pressure, high-compliance return — strongly affected by external load.',
  },
  {
    id: 'lymph',
    name: 'Lymph & interstitium',
    color: '#9fe86b',
    opacity: 0.7,
    visible: false,
    blurb: 'Interstitial drainage driven by tissue motion, respiration and pulse.',
  },
  {
    id: 'receptor',
    name: 'Mechanoreceptors',
    color: '#a58cff',
    opacity: 1,
    visible: true,
    blurb: 'Encapsulated and free endings that convert local mechanics into firing.',
  },
  {
    id: 'network',
    name: 'Tension network',
    color: '#8ea8bd',
    opacity: 0.42,
    visible: false,
    blurb: 'The abstract biotensegrity graph the whole model is solved on.',
  },
];

/** Scale tiers for multi-scale navigation. `span` is the field of view in metres. */
export const SCALES = [
  { id: 'body', name: 'Body', span: 2.1, note: '≈ 1.75 m' },
  { id: 'region', name: 'Region', span: 0.52, note: '≈ 50 cm' },
  { id: 'organ', name: 'Organ', span: 0.12, note: '≈ 12 cm' },
  { id: 'tissue', name: 'Tissue', span: 0.012, note: '≈ 12 mm' },
  { id: 'receptor', name: 'Receptor', span: 0.0009, note: '≈ 900 µm' },
];

export const TOOLS = [
  {
    id: 'tension',
    name: 'Tension',
    verb: 'Tensioned',
    blurb: 'Raises resting tension in the selected element and everything continuous with it.',
  },
  {
    id: 'compression',
    name: 'Compression',
    verb: 'Compressed',
    blurb: 'Loads the region normal to its surface, raising interstitial pressure.',
  },
  {
    id: 'restriction',
    name: 'Restriction',
    verb: 'Restricted',
    blurb: 'Reduces local glide and extensibility — stiffer, slower, more viscous.',
  },
  {
    id: 'shear',
    name: 'Shear',
    verb: 'Sheared',
    blurb: 'Loads the plane tangentially, the stimulus most fascial endings prefer.',
  },
  {
    id: 'release',
    name: 'Release',
    verb: 'Released',
    blurb: 'Restores resting length, glide and viscoelastic time constants locally.',
  },
];

/* ------------------------------------------------------------
   Persisted render preferences.

   Only two settings persist, and both do so because a *tester* needs them to:
   locking a quality tier and leaving the diagnostics panel open have to survive
   the reloads that measuring on real hardware requires. Everything else about a
   session is deliberately transient — a saved project is the way to keep state.
   ------------------------------------------------------------ */

const PREFS_KEY = 'continuum.render.v1';
const PERSISTED = ['quality', 'perfHud'];

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p !== 'object') return {};
    const out = {};
    if (['auto', 'low', 'medium', 'high', 'ultra'].includes(p.quality)) out.quality = p.quality;
    if (typeof p.perfHud === 'boolean') out.perfHud = p.perfHud;
    return out;
  } catch {
    return {};
  }
}

function writePrefs(render) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, render[k]]))));
  } catch {
    /* storage may be unavailable; the setting then lasts one page load */
  }
}

class Store extends Emitter {
  constructor() {
    super();

    this.layers = new Map(
      LAYERS.map((l) => [
        l.id,
        { ...l, baseOpacity: l.opacity, count: 0 },
      ])
    );

    /** ids of layers currently soloed (empty = no isolation) */
    this.solo = new Set();

    /** Set of structure keys currently selected */
    this.selection = new Set();
    this.hover = null;

    /** highlighted myofascial continuity ids */
    this.activeChains = new Set();
    /** receptor classes currently drawn */
    this.receptorFilter = new Set(['pacinian', 'meissner', 'ruffini', 'free', 'spindle', 'golgi', 'intero']);

    this.scaleIndex = 0;
    this.scaleFloat = 0; // continuous position along the scale ladder
    this.focus = null; // structure key the camera is anchored to
    /** receptor class shown in micro-anatomy at the deepest tier */
    this.microFocus = 'pacinian';

    /**
     * Microscope mode — micro-mechanics on one region of interest.
     *
     * `active` is latched with hysteresis by the scale manager rather than being
     * a plain threshold on the tier, because sitting exactly on a boundary while
     * orbiting would otherwise flicker the entire mode on and off. `pinned` is the
     * explicit override: once the user asks for the mode, camera distance stops
     * deciding for them.
     */
    this.micro = {
      active: false,
      pinned: false,
      roi: 'suboccipital',
      /** damp gross body motion, so a millimetre-scale subject holds still */
      steady: true,
      /* ---- Extended model ----
         'basic' is the shipped default and stays the default: the length-and-
         velocity law this ROI was verified against. 'extended' is opt-in. */
      model: 'basic',
      gammaStatic: 0,
      gammaDynamic: 0,
      /** id of the scenario protocol to run, or null for live body length */
      scenario: null,
    };

    this.physio = {
      running: true,
      speed: 1,
      heartRate: 62, // bpm
      respRate: 13, // breaths / min
      tone: 0.5, // resting myofascial tone 0..1
      motility: 0.55, // visceral motility
      breathDepth: 0.55,
    };

    this.tool = { mode: 'restriction', magnitude: 0.6, radius: 0.14 };

    this.render = {
      bloom: 0.32,
      signals: true,
      forceColor: true,
      network: false,
      exposure: 1.0,
      /** 'auto' | 'low' | 'medium' | 'high' | 'ultra' — persisted */
      quality: 'auto',
      /** on-screen frame diagnostics — persisted */
      perfHud: false,
      ...readPrefs(),
    };

    /** live restriction / load records applied by the user */
    this.restrictions = [];

    /** metrics published by the simulation each frame */
    this.metrics = {
      networkLoad: 0,
      peakLoad: 0,
      fidelity: 1,
      latency: 0,
      bandwidth: 1,
      firing: 0,
      pulse: 0,
      breath: 0,
      spo: 0,
      integrity: 1,
      strain: 0,
    };
  }

  /* ---------- layers ---------- */

  layer(id) {
    return this.layers.get(id);
  }

  /**
   * Effective opacity accounting for entitlement and isolation state.
   * 0 → not drawn, and therefore not pickable either.
   *
   * The licence check is here rather than in the UI on purpose: this is the one
   * function every renderer and the raycaster both go through, so a premium
   * layer cannot be revealed by scripting the store or by a stale UI state.
   */
  effectiveOpacity(id) {
    const l = this.layers.get(id);
    if (!l || !l.visible) return 0;
    if (!entitlements.canSeeLayer(id)) return 0;
    if (this.solo.size && !this.solo.has(id)) return 0;
    return l.opacity;
  }

  setLayerVisible(id, v) {
    const l = this.layers.get(id);
    if (!l || l.visible === v) return;
    if (v && !entitlements.canSeeLayer(id)) {
      entitlements.require('layers.advanced', { layer: id });
      return;
    }
    l.visible = v;
    this.emit('layers');
  }

  toggleLayer(id) {
    const l = this.layers.get(id);
    if (l) this.setLayerVisible(id, !l.visible);
  }

  setLayerOpacity(id, v) {
    const l = this.layers.get(id);
    if (!l) return;
    if (!entitlements.require('layers.opacity', { layer: id })) return;
    l.opacity = clamp(v, 0, 1);
    this.emit('layers');
  }

  toggleSolo(id) {
    if (!entitlements.require('select.isolate', { layer: id })) return;
    if (this.solo.has(id)) this.solo.delete(id);
    else this.solo.add(id);
    this.emit('layers');
  }

  clearSolo() {
    if (!this.solo.size) return;
    this.solo.clear();
    this.emit('layers');
  }

  showAll() {
    this.solo.clear();
    for (const l of this.layers.values()) {
      if (entitlements.canSeeLayer(l.id)) l.visible = true;
    }
    this.emit('layers');
  }

  /* ---------- selection ---------- */

  select(key, additive = false) {
    // free tier gets single selection; additive requests collapse to a replace
    if (additive && !entitlements.can('select.multi')) {
      entitlements.require('select.multi', { key });
      additive = false;
    }
    if (!additive) this.selection.clear();
    if (key) {
      if (additive && this.selection.has(key)) this.selection.delete(key);
      else this.selection.add(key);
    }
    this.emit('selection');
  }

  deselect(key) {
    this.selection.delete(key);
    this.emit('selection');
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.emit('selection');
  }

  setHover(key) {
    if (this.hover === key) return;
    this.hover = key;
    this.emit('hover');
  }

  /* ---------- chains / receptors ---------- */

  toggleChain(id) {
    if (this.activeChains.has(id)) this.activeChains.delete(id);
    else this.activeChains.add(id);
    this.emit('chains');
  }

  toggleReceptorClass(id) {
    if (this.receptorFilter.has(id)) this.receptorFilter.delete(id);
    else this.receptorFilter.add(id);
    this.emit('receptors');
  }

  /* ---------- microscope mode ---------- */

  setMicro(k, v) {
    if (this.micro[k] === v) return;
    this.micro[k] = v;
    this.emit('micro', k);
  }

  /**
   * Explicit request for Microscope mode. Pins it, so camera distance no longer
   * turns it off — leaving is also explicit, or by pulling back far enough that
   * the hysteresis releases the pin.
   */
  setMicroPinned(on) {
    this.micro.pinned = !!on;
    if (on) this.micro.active = true;
    this.emit('micro', 'pinned');
  }

  setMicroFocus(id) {
    if (this.microFocus === id) return;
    this.microFocus = id;
    this.emit('microFocus');
  }

  /* ---------- params ---------- */

  /** Physiology knobs that shape the model rather than just its rate. */
  static ADVANCED_PHYSIO = ['tone', 'motility', 'breathDepth', 'speed'];

  setPhysio(k, v) {
    if (Store.ADVANCED_PHYSIO.includes(k) && !entitlements.require('physio.advanced', { param: k })) return;
    this.physio[k] = v;
    this.emit('physio', k);
  }

  setTool(k, v) {
    if (!entitlements.require('tool.intervention', { param: k })) return;
    this.tool[k] = v;
    this.emit('tool', k);
  }

  /** Render toggles that are premium visualisation features. */
  static GATED_RENDER = {
    forceColor: 'viz.forceColor',
    signals: 'viz.signals',
    network: 'viz.network',
  };

  setRender(k, v) {
    const cap = Store.GATED_RENDER[k];
    if (cap && v && !entitlements.require(cap, { param: k })) return;
    this.render[k] = v;
    if (PERSISTED.includes(k)) writePrefs(this.render);
    this.emit('render', k);
  }

  /**
   * Whether a render feature should actually draw. Consumers must use this
   * rather than reading `render[k]` directly, so a flag left true by a licence
   * downgrade cannot keep a premium visualisation on screen.
   */
  renderEnabled(k) {
    const cap = Store.GATED_RENDER[k];
    return !!this.render[k] && (!cap || entitlements.can(cap));
  }

  /* ---------- scale ---------- */

  setScaleFloat(v) {
    const c = clamp(v, 0, SCALES.length - 1);
    if (Math.abs(c - this.scaleFloat) < 1e-6) return;
    this.scaleFloat = c;
    const idx = Math.round(c);
    if (idx !== this.scaleIndex) {
      this.scaleIndex = idx;
      this.emit('scale');
    }
    this.emit('scaleFloat');
  }

  /* ---------- restrictions ---------- */

  addRestriction(rec) {
    this.restrictions.push(rec);
    this.emit('restrictions');
    return rec;
  }

  removeRestriction(id) {
    const i = this.restrictions.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.restrictions.splice(i, 1);
      this.emit('restrictions');
    }
  }

  clearRestrictions() {
    if (!this.restrictions.length) return;
    this.restrictions.length = 0;
    this.emit('restrictions');
  }
}

export const store = new Store();
