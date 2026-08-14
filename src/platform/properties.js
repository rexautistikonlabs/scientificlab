/* ============================================================
   Property store — everything the platform knows about a structure,
   keyed by anatomical ID.

   Four data layers, in increasing precedence:

     base        immutable anatomical properties derived once at build
     dataset     research / measurement overlays, keyed by ID
     pathology   parameter sets that also drive the solver
     subject     per-subject values, highest precedence

   `bag(id)` merges them and reports provenance for every field, because a
   research tool that shows a number without saying where it came from is
   not a research tool. Live simulation state is read straight from the
   solver and afferent model on demand rather than cached, so it is always
   the current frame.

   Nothing here touches geometry, materials or the solver's inner loop. New
   data sources are registered by ID and become visible everywhere at once.
   ============================================================ */

import { clamp } from '../core/util.js';
import { describe } from '../anatomy/info.js';

/** Fields a dataset may bind to a structure, with display metadata. */
export const NUMERIC_FIELDS = Object.freeze({
  modulusMPa: { label: 'Elastic modulus', unit: 'MPa' },
  tauSec: { label: 'Relaxation τ', unit: 's' },
  thicknessMm: { label: 'Thickness', unit: 'mm' },
  glideMm: { label: 'Glide excursion', unit: 'mm' },
  innervationPerCm2: { label: 'Innervation density', unit: '/cm²' },
  waterFraction: { label: 'Water fraction', unit: '' },
  collagenFraction: { label: 'Collagen fraction', unit: '' },
});

export class PropertyStore {
  constructor({ ids, registry, solver, afferent }) {
    this.ids = ids;
    this.registry = registry;
    this.solver = solver;
    this.afferent = afferent;

    this._base = new Map(); // id → frozen base property bag
    this.datasets = new Map(); // datasetId → record
    this.pathologies = new Map(); // pathologyId → record
    this.subject = new Map(); // id → { field: value }
    this.subjectMeta = { label: null, note: null };

    this._activeOverlay = null; // datasetId currently painted onto the model
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of [...this._listeners]) fn();
  }

  /* ============================================================
     Base layer
     ============================================================ */

  /**
   * Build the immutable base bag for every registered structure. Called once
   * after the body is assembled.
   */
  buildBase() {
    for (const s of this.registry.list) {
      const id = s.id;
      if (!id) continue;
      const info = describe(s);
      this._base.set(
        id,
        Object.freeze({
          id,
          key: s.key,
          name: s.name,
          latin: s.latin || null,
          layer: s.layer,
          group: s.group || null,
          region: s.region || null,
          side: s.side === 1 ? 'left' : s.side === -1 ? 'right' : 'midline',
          tissue: info.tissue,
          modulus: info.modulus,
          viscoelasticity: info.tau,
          role: info.role,
          preferredStimulus: info.stimulus,
          note: info.note,
          receptors: Object.freeze([...info.receptors]),
          pathway: info.pathway.id,
          pathwayName: info.pathway.name,
          pathwayCarries: info.pathway.carries,
          networkNodes: s.nodes.length,
          spanM: +s.span.toFixed(4),
        })
      );
    }
    return this;
  }

  base(idOrKey) {
    const id = this.ids.normalise(idOrKey);
    return id ? this._base.get(id) || null : null;
  }

  /* ============================================================
     Live simulation state
     ============================================================ */

  /**
   * Current mechanical and sensory state. Read live from the core engine —
   * this is the same data the shaders and telemetry use, not a copy.
   */
  live(idOrKey) {
    const id = this.ids.normalise(idOrKey);
    if (!id) return null;
    const rec = this.ids.resolve(id);
    if (!rec) return null;

    if (rec.kind === 'receptorInstance') return this._liveReceptorInstance(rec);

    const s = this.registry.get(rec.key);
    if (!s) return null;
    const st = this.registry.stateOf(s);
    const base = this._base.get(id);
    const classes = this.afferent.describeFor(base?.receptors || []);

    // pathway state for the structure's afferent destination
    const pw = this.afferent.pathways.get(base?.pathway || 'dorsalColumn');

    // population-weighted sensory summary across the classes present here
    let fw = 0;
    let fid = 0;
    let bw = 0;
    let lat = 0;
    let rate = 0;
    for (const c of classes) {
      const w = 0.35 + c.rateNorm;
      fid += c.fidelity * w;
      bw += c.bandwidth * w;
      lat += c.latency * w;
      rate += c.rate;
      fw += w;
    }
    const denom = Math.max(1e-6, fw);

    return {
      id,
      tensionVsRest: st.dev,
      loadNormalised: st.load,
      strainRate: st.rate,
      stiffening: st.stiffness,
      viscosity: st.viscosity,
      interstitialPressure: st.pressure,
      displacementMm: this._meanDisplacementMm(s.nodes),
      signalFidelity: classes.length ? clamp(fid / denom, 0, 1) : null,
      signalBandwidth: classes.length ? clamp(bw / denom, 0, 1) : null,
      signalLatencyMs: classes.length ? lat / denom : null,
      firingHz: classes.length ? rate : null,
      pathwayRateHz: pw ? pw.rate : null,
      pathwayFidelity: pw ? pw.fidelity : null,
      classes,
    };
  }

  _liveReceptorInstance(rec) {
    const pop = rec.ref?.population;
    const i = rec.ref?.index ?? 0;
    if (!pop) return null;
    const node = pop.nodes[i] | 0;
    const s = this.solver;
    const p = this.afferent.pops.get(pop.id);
    return {
      id: rec.id,
      receptorClass: pop.id,
      tensionVsRest: s.dev[node] || 0,
      loadNormalised: s.load[node] || 0,
      strainRate: s.strainRate[node] || 0,
      stiffening: s.stiffness[node] || 0,
      viscosity: s.viscosity[node] || 0,
      interstitialPressure: s.pressure[node] || 0,
      displacementMm: this._meanDisplacementMm([node]),
      signalFidelity: p ? p.fidelity : null,
      signalBandwidth: p ? p.bandwidth : null,
      signalLatencyMs: p ? p.latency : null,
      firingHz: p ? p.rate : null,
      classes: p ? this.afferent.describeFor([pop.id]) : [],
    };
  }

  _meanDisplacementMm(nodes) {
    if (!nodes || !nodes.length) return 0;
    const s = this.solver;
    let sum = 0;
    for (const i of nodes) {
      const dx = s.pos[i * 3] - s.home[i * 3];
      const dy = s.pos[i * 3 + 1] - s.home[i * 3 + 1];
      const dz = s.pos[i * 3 + 2] - s.home[i * 3 + 2];
      sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return (sum / nodes.length) * 1000;
  }

  /* ============================================================
     Datasets — research / measurement overlays
     ============================================================ */

  /**
   * Register an ID-keyed dataset. `values` maps anatomical ID (or alias, or
   * region code) to a numeric value or a field bag.
   *
   * Unresolvable IDs are reported rather than dropped silently — a dataset
   * that half-binds is a data problem the user needs to see.
   */
  registerDataset({ id, name, field = 'value', unit = '', note = '', source = '', values = {}, colorLow = '#2b6cb0', colorHigh = '#ff6f52' }) {
    const bound = new Map();
    const unresolved = [];
    for (const [rawKey, v] of Object.entries(values)) {
      const canon = this.ids.normalise(rawKey);
      if (canon) {
        bound.set(canon, v);
        continue;
      }
      // region codes fan out to every structure whose centre falls in them
      const expanded = this._expandRegion(rawKey);
      if (expanded.length) {
        for (const sid of expanded) if (!bound.has(sid)) bound.set(sid, v);
      } else {
        unresolved.push(rawKey);
      }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of bound.values()) {
      const n = typeof v === 'number' ? v : v?.[field];
      if (typeof n === 'number') {
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
      }
    }
    const rec = {
      id,
      name,
      field,
      unit,
      note,
      source,
      values: bound,
      unresolved,
      range: lo <= hi ? [lo, hi] : [0, 1],
      colorLow,
      colorHigh,
      active: false,
    };
    this.datasets.set(id, rec);
    this._emit();
    return rec;
  }

  _expandRegion(code) {
    const up = String(code).toUpperCase();
    const out = [];
    for (const s of this.registry.list) {
      if (!s.id) continue;
      const r = s.regionCode;
      if (r === up || (r && r.split('_')[0] === up)) out.push(s.id);
    }
    return out;
  }

  datasetValue(datasetId, idOrKey) {
    const ds = this.datasets.get(datasetId);
    if (!ds) return null;
    const id = this.ids.normalise(idOrKey);
    if (!id) return null;
    const v = ds.values.get(id);
    if (v == null) return null;
    return typeof v === 'number' ? v : v[ds.field];
  }

  /** Which dataset is currently painted onto the model, if any. */
  get activeOverlay() {
    return this._activeOverlay ? this.datasets.get(this._activeOverlay) || null : null;
  }

  setOverlay(datasetId) {
    if (datasetId && !this.datasets.has(datasetId)) return false;
    for (const ds of this.datasets.values()) ds.active = ds.id === datasetId;
    this._activeOverlay = datasetId || null;
    this.paintOverlay();
    this._emit();
    return true;
  }

  /**
   * Write the active dataset onto the structures' overlay uniforms. Done as a
   * per-material uniform rather than through the solved field texture, so the
   * single-solve architecture is untouched and an overlay costs nothing per
   * frame — only when it changes.
   */
  paintOverlay() {
    const ds = this.activeOverlay;
    for (const s of this.registry.list) {
      if (!ds) {
        s.setUniform('uOverlay', 0);
        continue;
      }
      const v = this.datasetValue(ds.id, s.id);
      if (v == null) {
        s.setUniform('uOverlay', 0);
        continue;
      }
      const [lo, hi] = ds.range;
      const t = hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0.5;
      s.setUniform('uOverlay', 1);
      s.setOverlayColor(ds.colorLow, ds.colorHigh, t);
    }
  }

  /* ============================================================
     Pathology parameter sets
     ============================================================ */

  /**
   * A pathology set is a named collection of ID-keyed mechanical modifiers.
   * Applying one creates ordinary solver interventions — the same verified
   * code path the manual tools use — so pathology inherits the physics rather
   than introducing a second, unvalidated one.
   *
   * effects: { <ID or region>: { kind, magnitude } }
   */
  registerPathology({ id, name, note = '', source = '', effects = {} }) {
    const bound = [];
    const unresolved = [];
    for (const [rawKey, spec] of Object.entries(effects)) {
      const canon = this.ids.normalise(rawKey);
      const targets = canon ? [canon] : this._expandRegion(rawKey);
      if (!targets.length) {
        unresolved.push(rawKey);
        continue;
      }
      for (const t of targets) bound.push({ id: t, ...spec });
    }
    const rec = { id, name, note, source, effects: bound, unresolved, applied: false, ivIds: [] };
    this.pathologies.set(id, rec);
    this._emit();
    return rec;
  }

  applyPathology(pid, store) {
    const rec = this.pathologies.get(pid);
    if (!rec || rec.applied) return null;
    let n = 0;
    rec.effects.forEach((eff, i) => {
      const key = this.ids.keyFor(eff.id);
      const s = key ? this.registry.get(key) : null;
      if (!s || !s.nodes.length) return;
      const ivId = `path:${pid}:${i}`;
      this.solver.addIntervention({
        id: ivId,
        kind: eff.kind || 'restriction',
        nodes: s.nodes,
        magnitude: clamp(eff.magnitude ?? 0.5, 0, 1),
        center: s.center.clone(),
        radius: s.span,
        label: `${rec.name} · ${s.name}`,
      });
      rec.ivIds.push(ivId);
      store?.addRestriction({
        id: ivId,
        kind: eff.kind || 'restriction',
        kindName: rec.name,
        label: `${rec.name} · ${s.name}`,
        magnitude: clamp(eff.magnitude ?? 0.5, 0, 1),
        radius: s.span,
        nodeCount: s.nodes.length,
        pathology: pid,
      });
      n++;
    });
    rec.applied = n > 0;
    this._emit();
    return n;
  }

  clearPathology(pid, store) {
    const rec = this.pathologies.get(pid);
    if (!rec) return;
    for (const ivId of rec.ivIds) {
      this.solver.removeIntervention(ivId);
      store?.removeRestriction(ivId);
    }
    rec.ivIds.length = 0;
    rec.applied = false;
    this._emit();
  }

  /* ============================================================
     Subject data
     ============================================================ */

  setSubject(meta, values = {}) {
    this.subjectMeta = { ...this.subjectMeta, ...meta };
    for (const [rawKey, v] of Object.entries(values)) {
      const id = this.ids.normalise(rawKey);
      if (id) this.subject.set(id, { ...(this.subject.get(id) || {}), ...v });
    }
    this._emit();
  }

  clearSubject() {
    this.subject.clear();
    this.subjectMeta = { label: null, note: null };
    this._emit();
  }

  /* ============================================================
     Merged view
     ============================================================ */

  /**
   * The full property bag for a structure, with provenance. Every entry is
   * `{ label, value, unit, source }` so the inspector can show where each
   * number came from.
   */
  bag(idOrKey) {
    const id = this.ids.normalise(idOrKey);
    if (!id) return null;
    const base = this._base.get(id);
    const rec = this.ids.resolve(id);
    const out = { id, kind: rec?.kind || 'structure', base, live: this.live(id), fields: [] };

    const push = (label, value, unit, source) => out.fields.push({ label, value, unit, source });

    for (const [dsId, ds] of this.datasets) {
      const v = this.datasetValue(dsId, id);
      if (v != null) push(ds.name, v, ds.unit, ds.source || `dataset:${dsId}`);
    }
    for (const [, p] of this.pathologies) {
      if (!p.applied) continue;
      const eff = p.effects.find((e) => e.id === id);
      if (eff) push(p.name, `${eff.kind} ${(eff.magnitude * 100).toFixed(0)} %`, '', `pathology:${p.id}`);
    }
    const subj = this.subject.get(id);
    if (subj) {
      for (const [k, v] of Object.entries(subj)) {
        const meta = NUMERIC_FIELDS[k];
        push(meta?.label || k, v, meta?.unit || '', this.subjectMeta.label ? `subject:${this.subjectMeta.label}` : 'subject');
      }
    }
    return out;
  }

  /** Serialisable snapshot of everything the user has added. */
  serialise() {
    return {
      overlay: this._activeOverlay,
      datasets: [...this.datasets.values()].map((d) => ({
        id: d.id,
        name: d.name,
        field: d.field,
        unit: d.unit,
        note: d.note,
        source: d.source,
        colorLow: d.colorLow,
        colorHigh: d.colorHigh,
        values: Object.fromEntries(d.values),
      })),
      pathologies: [...this.pathologies.values()].map((p) => ({
        id: p.id,
        name: p.name,
        note: p.note,
        source: p.source,
        applied: p.applied,
        effects: p.effects,
      })),
      subject: { meta: this.subjectMeta, values: Object.fromEntries(this.subject) },
    };
  }

  restore(snap, store) {
    if (!snap) return;
    for (const d of snap.datasets || []) {
      if (!this.datasets.has(d.id)) this.registerDataset(d);
    }
    for (const p of snap.pathologies || []) {
      if (!this.pathologies.has(p.id)) {
        this.pathologies.set(p.id, { ...p, applied: false, ivIds: [], unresolved: [] });
      }
      if (p.applied) this.applyPathology(p.id, store);
    }
    if (snap.subject) this.setSubject(snap.subject.meta || {}, snap.subject.values || {});
    if (snap.overlay) this.setOverlay(snap.overlay);
    this._emit();
  }
}

/**
 * Two demonstration datasets and two pathology sets, so the overlay and
 * pathology machinery is exercised and visible out of the box. Values are
 * representative literature ranges, keyed by anatomical ID — exactly the shape
 * an external dataset would take.
 */
export function registerReferenceData(props) {
  props.registerDataset({
    id: 'innervation',
    name: 'Innervation density',
    unit: '/cm²',
    field: 'value',
    source: 'reference · representative literature ranges',
    note:
      'Receptor count per square centimetre of tissue surface. Highest at the fingertip pad and in the deep cervical and retinacular tissues; lowest in large-volume muscle.',
    colorLow: '#2b6cb0',
    colorHigh: '#ffcf6b',
    values: {
      SKIN_HAND_L: 2000,
      SKIN_HAND_R: 2000,
      SKIN_FOOT_L: 620,
      SKIN_FOOT_R: 620,
      SKIN_TRUNK: 95,
      FASCIA_CERVICAL_DEEP: 1450,
      FASCIA_THORACOLUMBAR: 880,
      FASCIA_PLANTAR_L: 940,
      FASCIA_PLANTAR_R: 940,
      FASCIA_RETINACULUM_ANKLE_L: 1320,
      FASCIA_RETINACULUM_ANKLE_R: 1320,
      FASCIA_RETINACULUM_WRIST_L: 1280,
      FASCIA_RETINACULUM_WRIST_R: 1280,
      FASCIA_MESENTERY: 410,
      MUSCLE_SPLENIUS_L: 1900,
      MUSCLE_SPLENIUS_R: 1900,
      MUSCLE_QUADRICEPS_L: 60,
      MUSCLE_QUADRICEPS_R: 60,
      MUSCLE_DIAPHRAGM: 520,
      ORGAN_HEART: 240,
      ORGAN_SMALL_INT: 380,
    },
  });

  props.registerDataset({
    id: 'glide',
    name: 'Interfacial glide',
    unit: 'mm',
    field: 'value',
    source: 'reference · representative literature ranges',
    note:
      'Excursion available at the interface before tension rises. Loss of glide is the mechanical definition of restriction used by this model.',
    colorLow: '#ff6f52',
    colorHigh: '#4fe0a0',
    values: {
      FASCIA_SUPERFICIAL_TRUNK: 18,
      FASCIA_SUPERFICIAL_LEG_L: 14,
      FASCIA_SUPERFICIAL_LEG_R: 14,
      FASCIA_SUPERFICIAL_ARM_L: 16,
      FASCIA_SUPERFICIAL_ARM_R: 16,
      FASCIA_CERVICAL_DEEP: 9,
      FASCIA_THORACOLUMBAR: 6,
      FASCIA_LATA_L: 5,
      FASCIA_LATA_R: 5,
      FASCIA_PLANTAR_L: 3,
      FASCIA_PLANTAR_R: 3,
      NERVE_SCIATIC_L: 12,
      NERVE_SCIATIC_R: 12,
      NERVE_MEDIAN_L: 9,
      NERVE_MEDIAN_R: 9,
      FASCIA_PLEURA_L: 21,
      FASCIA_PLEURA_R: 21,
      FASCIA_MESENTERY: 26,
    },
  });

  props.registerPathology({
    id: 'cervicalRestriction',
    name: 'Deep cervical restriction',
    source: 'parameter set · illustrative',
    note:
      'Loss of glide through the investing, pretracheal and prevertebral layers, with the suboccipital tissues involved. Watch the Pacinian and Meissner channels degrade while the slow tonic classes hold.',
    effects: {
      FASCIA_CERVICAL_DEEP: { kind: 'restriction', magnitude: 0.85 },
      FASCIA_NUCHAL: { kind: 'restriction', magnitude: 0.6 },
      MUSCLE_SPLENIUS_L: { kind: 'restriction', magnitude: 0.5 },
      MUSCLE_SPLENIUS_R: { kind: 'restriction', magnitude: 0.5 },
      MUSCLE_SCALENE_L: { kind: 'tension', magnitude: 0.4 },
      MUSCLE_SCALENE_R: { kind: 'tension', magnitude: 0.4 },
    },
  });

  props.registerPathology({
    id: 'thoracicHypomobility',
    name: 'Thoracic hypomobility',
    source: 'parameter set · illustrative',
    note:
      'Reduced rib-interval and diaphragmatic excursion. Follow the breath-excursion, fluid-transport and interoceptive readouts rather than the tension map.',
    effects: {
      MUSCLE_DIAPHRAGM: { kind: 'compression', magnitude: 0.6 },
      MUSCLE_INTERCOSTALS_L: { kind: 'restriction', magnitude: 0.7 },
      MUSCLE_INTERCOSTALS_R: { kind: 'restriction', magnitude: 0.7 },
      FASCIA_MEDIASTINUM: { kind: 'restriction', magnitude: 0.45 },
    },
  });

  props.registerPathology({
    id: 'plantarLoad',
    name: 'Plantar fascia loading',
    source: 'parameter set · illustrative',
    note:
      'Sustained tension at the caudal anchor of the superficial posterior line. The clearest demonstration of series continuity: watch the lumbar and cranial readouts, not the foot.',
    effects: {
      FASCIA_PLANTAR_L: { kind: 'tension', magnitude: 0.9 },
      FASCIA_PLANTAR_R: { kind: 'tension', magnitude: 0.9 },
    },
  });
}
