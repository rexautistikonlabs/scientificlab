/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Atlas instrument shell — the paper chrome around the viewport.

   Identity-bar meter row, the clickable workflow stepper, the
   viewport title + zoom chip, the bottom stat strip, and the
   collapse behaviour that hands the pixels to the anatomy at deep
   scales. Every control here drives the same store / action paths
   the side panels use — the stepper is a second door to the same
   rooms, never a second copy of the state.

   Copy tone: short, technical, calm. Every hoverable meter says it
   is a model output.
   ============================================================ */

import { el, make, clamp } from '../core/util.js';
import { SCALES, TOOLS } from '../core/store.js';
import { RECEPTORS, RECEPTOR_ORDER } from '../anatomy/info.js';
import { TEACHING_SYSTEMS } from '../platform/overlays.js';
import { entitlements } from '../platform/entitlements.js';

/** Scale-dependent viewport subtitles — where the camera actually is. */
const SUBTITLES = [
  'standing body · pre-stressed tension network at rest',
  'regional anatomy · named muscles, fascia, vessels and nerves',
  'inside the body cavity · organs suspended in their fascia',
  'inside the tissue · fibre architecture at millimetre scale',
  'at a single mechanoreceptor · schematic, model-driven',
  'inside a single cell · schematic composition, not imaging',
];

const ID_METERS = [
  { id: 'scale', label: 'SCALE', note: 'Current tier of the six-order-of-magnitude descent.' },
  { id: 'selected', label: 'SELECTED', note: 'The structure under inspection, with laterality.' },
  { id: 'load', label: 'NETWORK LOAD', note: 'RMS tension against resting pre-tension. Model output — not a measurement.' },
  { id: 'integrity', label: 'SIGNAL INTEGRITY', note: 'Composite of fidelity, timing and bandwidth. Model output — not a measurement.' },
  { id: 'afferent', label: 'AFFERENT RATE', note: 'Summed modelled population firing, inward. Model output — not a measurement.' },
  { id: 'efferent', label: 'EFFERENT DRIVE', note: 'Composite outward drive: somatic, fusimotor, autonomic. Model output — not a measurement.' },
  { id: 'overlay', label: 'OVERLAY', note: 'Active teaching overlays. Teaching atlas — not an indication, not a protocol.' },
];

export class AtlasShell {
  constructor({ store, scales, controls, afferent, efferent, solver, physio, teaching, actions, hud, panels, workspace }) {
    this.store = store;
    this.scales = scales;
    this.controls = controls;
    this.afferent = afferent;
    this.efferent = efferent;
    this.solver = solver;
    this.physio = physio;
    this.teaching = teaching;
    this.actions = actions;
    this.hud = hud;
    this.panels = panels;
    this.workspace = workspace;

    this._t0 = performance.now();
    this._session = Math.random().toString(36).slice(2, 8).toUpperCase();
    this._collapsed = false;
    this._userPref = null; // manual pane override, null = automatic by tier

    this._buildIdentityMeters();
    this._buildStepper();
    this._wireStatStrip();
    this._initCollapse();

    this.subtitle = el('#vp-subtitle');
    this.zoomChip = el('#vp-zoom');
  }

  /* ============================================================
     Per-pane collapse

     Every information pane collapses independently to its title
     chip — no empty slab — and the state persists per browser.
     `]` toggles the pane under the pointer; `Shift+]` collapses or
     restores the lot. The identity bar and the disclaimer are not
     collapsible, by design.
     ============================================================ */

  _initCollapse() {
    const KEY = 'continuum.panes.v1';
    this._paneKey = KEY;
    this._panes = [
      { id: 'systems', sel: '#panel-left', label: 'Systems' },
      { id: 'inspector', sel: '#panel-right', label: 'Inspector' },
      { id: 'activity', sel: '#telemetry', label: 'Activity' },
      { id: 'coupling', sel: '#pane-coupling', label: 'Coupling map' },
      { id: 'observe', sel: '#pane-observe', label: 'Under observation' },
    ];
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      /* unavailable storage → session-only state */
    }
    this._hoverPane = null;

    for (const p of this._panes) {
      p.el = el(p.sel);
      if (!p.el) continue;
      const isSide = p.el.classList.contains('panel');
      let host = p.el.querySelector('.pane-h');
      if (isSide) {
        host = make('div', 'panel-head', `<span>${p.label}</span>`);
        p.el.prepend(host);
      }
      const btn = make('button', 'pane-toggle', '▾');
      btn.title = `Collapse / expand ${p.label} ( ] over the pane · ⇧] all panes)`;
      btn.setAttribute('aria-label', `Collapse ${p.label}`);
      btn.addEventListener('click', () => this.togglePane(p.id));
      host.appendChild(btn);
      p.btn = btn;
      p.el.addEventListener('pointerenter', () => (this._hoverPane = p.id));
      p.el.addEventListener('pointerleave', () => {
        if (this._hoverPane === p.id) this._hoverPane = null;
      });
      if (saved[p.id]) this._setPaneMin(p, true, false);
    }
  }

  _setPaneMin(p, min, persist = true) {
    if (!p?.el) return;
    p.el.classList.toggle('min', min);
    if (p.btn) p.btn.textContent = min ? '▸' : '▾';
    if (persist) {
      try {
        const saved = JSON.parse(localStorage.getItem(this._paneKey) || '{}');
        saved[p.id] = min ? 1 : 0;
        localStorage.setItem(this._paneKey, JSON.stringify(saved));
      } catch {
        /* fine — state just does not persist */
      }
    }
  }

  togglePane(id) {
    const p = this._panes.find((x) => x.id === (id || this._hoverPane));
    if (!p?.el) return false;
    this._setPaneMin(p, !p.el.classList.contains('min'));
    return true;
  }

  /** ⇧] — if anything is expanded, collapse everything; else restore all. */
  toggleAllPanes() {
    const anyOpen = this._panes.some((p) => p.el && !p.el.classList.contains('min'));
    for (const p of this._panes) this._setPaneMin(p, anyOpen);
    this.hud.toast(anyOpen ? 'All panes collapsed — <b>⇧]</b> restores them' : 'Panes restored', 2200);
  }

  get hoveredPane() {
    return this._hoverPane;
  }

  /* ============================================================
     Identity meters
     ============================================================ */

  _buildIdentityMeters() {
    const host = el('#id-meters');
    host.innerHTML = '';
    this.idMeters = new Map();
    for (const m of ID_METERS) {
      const node = make('div', 'idm', `<b>${m.label}</b><em>—</em>`);
      node.title = m.note;
      host.appendChild(node);
      this.idMeters.set(m.id, node.querySelector('em'));
    }
  }

  _setId(id, text, warn = false) {
    const em = this.idMeters.get(id);
    if (!em) return;
    if (em.textContent !== text) em.textContent = text;
    em.classList.toggle('warn', warn);
  }

  /* ============================================================
     Workflow stepper
     ============================================================ */

  _buildStepper() {
    const tabs = el('#stepper-tabs');
    this.rowEl = el('#stepper-row');
    tabs.innerHTML = '';
    this.steps = [
      { id: 'explore', n: '01', name: 'EXPLORE', build: () => this._rowExplore() },
      { id: 'layer', n: '02', name: 'LAYER', build: () => this._rowLayer() },
      { id: 'intervene', n: '03', name: 'INTERVENE', build: () => this._rowIntervene() },
      { id: 'signal', n: '04', name: 'SIGNAL', build: () => this._rowSignal() },
      { id: 'overlay', n: '05', name: 'OVERLAY', build: () => this._rowOverlay() },
      { id: 'inspect', n: '06', name: 'INSPECT', build: () => this._rowInspect() },
    ];
    this.tabEls = new Map();
    this.statusEls = new Map();
    for (const s of this.steps) {
      const b = make('button', 'step-tab', `<i>${s.n}</i><span>${s.name}</span><u class="step-status" data-s="idle"></u>`);
      b.addEventListener('click', () => this.openStep(this.active === s.id ? null : s.id));
      tabs.appendChild(b);
      this.tabEls.set(s.id, b);
      this.statusEls.set(s.id, b.querySelector('.step-status'));
    }
    this.active = null;
  }

  openStep(id) {
    this.active = id;
    for (const [k, b] of this.tabEls) b.classList.toggle('on', k === id);
    if (!id) {
      this.rowEl.hidden = true;
      this.rowEl.innerHTML = '';
      return;
    }
    this.rowEl.innerHTML = '';
    this.steps.find((s) => s.id === id).build();
    this.rowEl.hidden = false;
  }

  _chip(label, title, onClick, { on = false, cap = null } = {}) {
    const c = make('button', 'chip step-chip', label);
    c.title = title + (cap && !entitlements.can(cap) ? ' — Professional' : '');
    c.classList.toggle('on', on);
    if (cap && !entitlements.can(cap)) c.classList.add('locked');
    c.addEventListener('click', () => onClick(c));
    this.rowEl.appendChild(c);
    return c;
  }

  _rowExplore() {
    for (let i = 0; i < SCALES.length; i++) {
      this._chip(SCALES[i].name, `Traverse to the ${SCALES[i].name} scale (${SCALES[i].note})`, () => this.scales.goToTier(i), {
        on: Math.round(this.scales.tier) === i,
      });
    }
    this._chip('Frame selection', 'Frame the current selection (F)', () => this.actions.frameSelection());
    this._chip(
      'Track selection',
      'When on, selecting a structure flies the camera to it. Off by default — the specimen sits still unless you ask.',
      (c) => {
        this.store.setCameraTrack(!this.store.cameraTrack);
        c.classList.toggle('on', this.store.cameraTrack);
      },
      { on: this.store.cameraTrack }
    );
    this._chip('Isolate', 'Isolate the selected systems (I)', () => this.actions.isolateSelection(), { cap: 'select.isolate' });
    this._chip('Reset view', 'Reset visibility and camera (R)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    });
  }

  _rowLayer() {
    for (const l of this.store.layers.values()) {
      this._chip(l.name, l.blurb, (c) => {
        this.store.toggleLayer(l.id);
        c.classList.toggle('on', this.store.layer(l.id).visible);
        this.panels.syncLayers?.();
      }, { on: l.visible });
    }
  }

  _rowIntervene() {
    for (const t of TOOLS) {
      this._chip(t.name, t.blurb, (c) => {
        this.store.setTool('mode', t.id);
        for (const el2 of this.rowEl.querySelectorAll('.step-chip')) el2.classList.remove('on');
        c.classList.add('on');
        this.panels.syncToolControls?.();
      }, { on: this.store.tool.mode === t.id, cap: 'tool.intervention' });
    }
    this._chip('Apply', 'Apply the mode to the selection (T)', () => this.actions.apply(), { cap: 'tool.intervention' });
    this._chip('Release all', 'Remove every applied load (⇧T)', () => this.actions.release(), { cap: 'tool.intervention' });
  }

  _rowSignal() {
    this._chip('Afferent', 'Inward packet streams — cyan, receptor to brainstem (A)', (c) => {
      this.store.setRender('signals', !this.store.render.signals);
      c.classList.toggle('on', this.store.renderEnabled('signals'));
    }, { on: this.store.renderEnabled('signals'), cap: 'viz.signals' });
    this._chip('Efferent', 'Outward packet streams — gold somatic, violet fusimotor, rose autonomic (E)', (c) => {
      this.store.setRender('efferent', !this.store.render.efferent);
      c.classList.toggle('on', this.store.renderEnabled('efferent'));
    }, { on: this.store.renderEnabled('efferent'), cap: 'viz.signals' });
    this._chip('Motor burst', 'A transient rise in alpha-like drive through the tone path (B)', () => {
      this.efferent.pulse(1);
      this.hud.toast('<b>Motor burst</b> — watch the gold streams and the tone-driven meters', 2400);
    });

    /* autonomic two-tone balance — schematic, and labelled so */
    const wrap = make('label', 'step-slider', `<span>Autonomic balance</span>`);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(this.store.efferent.autonomicBalance * 100));
    slider.title =
      'Schematic two-tone balance: left = parasympathetic-like (rate down, motility up), right = sympathetic-like. ' +
      'A teaching control over small multipliers inside the physiology — not autonomic physiology.';
    slider.addEventListener('input', () => this.store.setEfferent('autonomicBalance', +slider.value / 100));
    wrap.appendChild(slider);
    this.rowEl.appendChild(wrap);

    /* class filters: which receptor class the trace and micro views focus */
    for (const id of RECEPTOR_ORDER) {
      const r = RECEPTORS[id];
      this._chip(r.short, `Focus the afferent instrument on ${r.name}`, (c) => {
        this.afferent.setFocus(id);
        this.store.setMicroFocus(id);
        for (const el2 of this.rowEl.querySelectorAll('.step-chip.cls')) el2.classList.remove('on');
        c.classList.add('on');
      }, { on: this.store.microFocus === id }).classList.add('cls');
    }
  }

  _rowOverlay() {
    for (const [sysId, set] of Object.entries(TEACHING_SYSTEMS)) {
      this._chip(set.name.split(' ')[0], `${set.name} — teaching atlas, not an indication, not a protocol`, (c) => {
        this.store.toggleTeachingOverlay(sysId);
        c.classList.toggle('on', this.store.teachingOverlays.has(sysId));
      }, { on: this.store.teachingOverlays.has(sysId) });
    }
    this._chip('All', 'Every teaching system at once', () => {
      this.store.setTeachingOverlays(Object.keys(TEACHING_SYSTEMS));
      this.openStep('overlay');
    });
    this._chip('None', 'Hide every teaching overlay', () => {
      this.store.setTeachingOverlays([]);
      this.openStep('overlay');
    });
    const wrap = make('label', 'step-slider', `<span>Density</span>`);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '30';
    slider.max = '100';
    slider.value = String(Math.round(this.store.overlayDensity * 100));
    slider.addEventListener('input', () => this.store.setOverlayDensity(+slider.value / 100));
    wrap.appendChild(slider);
    this.rowEl.appendChild(wrap);
  }

  _rowInspect() {
    this._chip('Pin probe', 'Place a tension probe on the next click (measurement tool)', () => {
      this.workspace.setMeasureMode('tension');
    }, { cap: 'tool.measure' });
    this._chip('Distance', 'Measure a distance with two clicks (D)', () => {
      this.workspace.setMeasureMode('distance');
    }, { cap: 'tool.measure' });
    this._chip('Note', 'Pin an annotation to the next click (N)', () => this.actions.armAnnotation(), { cap: 'tool.annotate' });
    this._chip('Save view', 'Save the scene as a project (⌘S)', () => el('#btn-proj-save')?.click(), { cap: 'data.projects' });
  }

  /** Step statuses — idle / live / applied, like a bench checklist. */
  _syncStepStatus() {
    const set = (id, s) => {
      const u = this.statusEls.get(id);
      if (u && u.dataset.s !== s) u.dataset.s = s;
    };
    set('explore', this.scales.tier > 0.5 ? 'live' : 'idle');
    const hiddenLayers = [...this.store.layers.values()].filter((l) => !l.visible).length;
    set('layer', this.store.solo.size ? 'applied' : hiddenLayers ? 'live' : 'idle');
    set('intervene', this.store.restrictions.length ? 'applied' : 'idle');
    set('signal', this.store.renderEnabled('signals') || this.store.renderEnabled('efferent') ? 'live' : 'idle');
    set('overlay', this.store.teachingOverlays.size ? 'applied' : 'idle');
    set('inspect', this.store.selection.size ? 'live' : 'idle');
  }

  /* ============================================================
     Stat strip + collapse
     ============================================================ */

  _wireStatStrip() {
    this.ss = {
      integrity: el('#ss-integrity'),
      state: el('#ss-state'),
      layers: el('#ss-layers'),
      receptors: el('#ss-receptors'),
      packets: el('#ss-packets'),
      session: el('#ss-session'),
    };
    this.ss.session.textContent = this._session;
    this.panesEl = el('#atlas-panes');
    el('#btn-panes').addEventListener('click', () => {
      this._userPref = this.panesEl.classList.contains('collapsed') ? 'open' : 'closed';
      this._applyCollapse();
    });
  }

  _applyCollapse() {
    const auto = this.scales.tier >= 2.6; // deep scales: anatomy owns the pixels
    const closed = this._userPref ? this._userPref === 'closed' : auto;
    this.panesEl.classList.toggle('collapsed', closed);
    document.body.classList.toggle('panes-collapsed', closed);
    document.body.classList.toggle('atlas-deep', this.scales.tier >= 2.6);
  }

  /* ============================================================
     Per-frame (UI cadence)
     ============================================================ */

  update({ endings, effDrawn, affDrawn }) {
    const s = this.solver;
    const su = this.afferent.summary;
    const eff = this.efferent.out;
    const tier = Math.round(clamp(this.scales.tier, 0, SCALES.length - 1));

    /* identity meters */
    this._setId('scale', SCALES[tier].name);
    const sel = [...this.store.selection];
    let selText = '—';
    if (sel.length) {
      const st = this.workspace?.registry?.get?.(sel[0]);
      selText = sel.length > 1 ? `${sel.length} structures` : (this._selName?.(sel[0]) ?? sel[0]);
    }
    this._setId('selected', selText);
    const loadPct = (s.metrics.rms / Math.max(1e-6, s.baseRms)) * 100;
    this._setId('load', `${loadPct.toFixed(0)} %`, loadPct > 135);
    this._setId('integrity', `${(su.integrity * 100).toFixed(0)} %`, su.integrity < 0.72);
    this._setId('afferent', `${su.firing.toFixed(0)} Hz`);
    this._setId('efferent', `${(eff.drive * 100).toFixed(0)} %`);
    const act = this.teaching.activeSystems;
    this._setId('overlay', act.length === 0 ? 'none' : act.length === 3 ? 'all' : act.map((a) => a.slice(0, 5)).join('+'));

    /* clock */
    const secs = Math.floor((performance.now() - this._t0) / 1000);
    const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const clockEl = el('#id-clock');
    if (clockEl.textContent !== clock) clockEl.textContent = clock;

    /* viewport title + zoom */
    const sub = SUBTITLES[tier];
    if (this.subtitle.textContent !== sub) this.subtitle.textContent = sub;
    const mag = SCALES[0].span / Math.max(1e-9, this.controls.span);
    const magText = mag >= 100 ? `${mag.toFixed(0)}×` : mag >= 10 ? `${mag.toFixed(1)}×` : `${mag.toFixed(2)}×`;
    if (this.zoomChip.textContent !== magText) this.zoomChip.textContent = magText;

    /* stat strip */
    this.ss.integrity.textContent = `${(su.integrity * 100).toFixed(0)} %`;
    this.ss.state.textContent = this.store.restrictions.length
      ? 'intervening'
      : this.controls.flying
        ? 'traversing'
        : 'exploring';
    const visible = [...this.store.layers.values()].filter((l) => this.store.effectiveOpacity(l.id) > 0.004).length;
    this.ss.layers.textContent = `${visible}/${this.store.layers.size} systems`;
    this.ss.receptors.textContent = String(endings);
    this.ss.packets.textContent = `${affDrawn} ⟶ · ⟵ ${effDrawn}`;

    this._syncStepStatus();
    this._applyCollapse();
  }

  /** injected by main: key → display name */
  setSelectionNamer(fn) {
    this._selName = fn;
  }
}
