/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Workspace panels: research overlays, parameter sets, measurement
   tools and project persistence.

   All four address the model exclusively by anatomical ID, which is why they
   could be written without touching the engine: an overlay binds values to
   IDs, a parameter set binds mechanical modifiers to IDs, a probe anchors to
   an ID, and a project is a list of IDs plus state.
   ============================================================ */

import { el, make, formatLength } from '../core/util.js';
import { entitlements } from '../platform/entitlements.js';
import { BUNDLED_DATASETS, fetchDataset, parseDataset } from '../platform/datasets.js';
import { MEASURE_MODES } from '../tools/measure.js';

export class Workspace {
  constructor({ store, props, projects, measures, annotations, hud, premium, actions }) {
    this.store = store;
    this.props = props;
    this.projects = projects;
    this.measures = measures;
    this.annotations = annotations;
    this.hud = hud;
    this.premium = premium;
    this.actions = actions;

    /** current measurement mode, or null when the tool is disarmed */
    this.measureMode = null;

    this._buildOverlays();
    this._buildDatasetLoading();
    this._buildPathologies();
    this._buildMeasure();
    this._buildProjects();

    /* Rebuild rather than sync: a dataset can appear at any time — loaded from
       disk, fetched from the build, or restored with a project — and a restored
       overlay with no chip to turn it off again would be a trap. */
    props.onChange(() => {
      this._buildOverlays();
      this.syncPathologies();
    });
    store.on('restrictions', () => this.syncPathologies());
  }

  /* ============================================================
     Research overlays
     ============================================================ */

  _buildOverlays() {
    const host = el('#overlay-list');
    host.innerHTML = '';
    this._overlayChips = new Map();

    const none = make('button', 'chip', `<i></i><span>None</span>`);
    none.style.color = '#8ea8bd';
    none.title = 'Show each tissue in its own colour';
    none.addEventListener('click', () => this._pickOverlay(null));
    host.appendChild(none);
    this._overlayChips.set(null, none);

    for (const ds of this.props.datasets.values()) {
      const chip = make('button', 'chip', `<i></i><span>${ds.name}</span>`);
      chip.style.color = ds.colorHigh;
      chip.title = `${ds.name}${ds.unit ? ` (${ds.unit})` : ''} — ${ds.values.size} structures bound${
        ds.unresolved.length ? `, ${ds.unresolved.length} unresolved` : ''
      }\n${ds.note}`;
      chip.addEventListener('click', () => this._pickOverlay(ds.id));
      host.appendChild(chip);
      this._overlayChips.set(ds.id, chip);
    }

    /* Datasets shipped with the build, offered until they are loaded. They arrive
       over HTTP like anyone else's export would, rather than being compiled in —
       which is the point of demonstrating the format at all. */
    for (const b of BUNDLED_DATASETS) {
      if ([...this.props.datasets.values()].some((d) => d.name === b.label || d.source?.includes(b.url))) continue;
      const chip = make('button', 'chip chip-load', `<i></i><span>${b.label}</span>`);
      chip.title = `${b.note}\nClick to load from ${b.url}`;
      chip.addEventListener('click', () => this._loadBundled(b));
      host.appendChild(chip);
      this._overlayChips.set(`bundled:${b.url}`, chip);
    }

    this.syncOverlays();
  }

  /* ---------------- loading external datasets ---------------- */

  _buildDatasetLoading() {
    const file = el('#ds-file');
    el('#btn-ds-load').addEventListener('click', () => {
      if (!entitlements.require('data.overlays')) return;
      file.click();
    });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      if (!entitlements.require('data.overlays')) return;
      this._acceptDataset(parseDataset(await f.text()), f.name);
    });
  }

  async _loadBundled(b) {
    if (!entitlements.require('data.overlays', { dataset: b.url })) return;
    this.hud.toast(`Loading <b>${b.label}</b>…`, 1600);
    this._acceptDataset(await fetchDataset(b.url), b.label, b.url);
  }

  /**
   * Register a validated dataset and report honestly what bound and what did not.
   * An overlay that silently covers 30 of 50 requested structures is worse than
   * one that says so.
   */
  _acceptDataset(res, label, sourceUrl = null) {
    if (!res.ok) {
      this.hud.toast(`Could not load <b>${label}</b> — ${res.reason}`, 5000);
      return null;
    }
    const spec = { ...res.dataset };
    if (sourceUrl) spec.source = `${spec.source} · ${sourceUrl}`;
    const requested = Object.keys(spec.values).length;
    const rec = this.props.registerDataset(spec);
    this._buildOverlays();
    this.props.setOverlay(rec.id);
    const missed = rec.unresolved.length;
    this.hud.toast(
      `<b>${rec.name}</b> — ${rec.values.size} of ${requested} bound` +
        (missed ? ` · ${missed} unresolved: ${rec.unresolved.slice(0, 3).join(', ')}${missed > 3 ? '…' : ''}` : ''),
      missed ? 6500 : 3800
    );
    return rec;
  }

  _pickOverlay(id) {
    if (!entitlements.require('data.overlays', { dataset: id })) return;
    this.props.setOverlay(id);
    const ds = this.props.activeOverlay;
    this.hud.toast(ds ? `Overlay: <b>${ds.name}</b> · ${ds.values.size} structures` : 'Overlay cleared', 2400);
  }

  syncOverlays() {
    const active = this.props.activeOverlay?.id || null;
    for (const [id, chip] of this._overlayChips) chip.classList.toggle('on', id === active);
    this.premium.decorateChips([...this._overlayChips.values()], 'data.overlays');

    const box = el('#overlay-legend');
    const ds = this.props.activeOverlay;
    if (!ds) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const [lo, hi] = ds.range;
    const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
    box.innerHTML = `
      <div class="legend-bar" style="background:linear-gradient(90deg,${ds.colorLow},${ds.colorHigh})"></div>
      <div class="legend-scale"><span>${fmt(lo)} ${ds.unit}</span><span>${fmt(hi)} ${ds.unit}</span></div>
      <div class="legend-note">${ds.note}</div>
      <div class="legend-src">${ds.source} · ${ds.values.size} bound${
        ds.unresolved.length ? ` · ${ds.unresolved.length} unresolved ID${ds.unresolved.length > 1 ? 's' : ''}` : ''
      }</div>`;
  }

  /* ============================================================
     Pathology / parameter sets
     ============================================================ */

  _buildPathologies() {
    const host = el('#pathology-list');
    host.innerHTML = '';
    this._pathChips = new Map();
    for (const p of this.props.pathologies.values()) {
      const chip = make('button', 'chip', `<i></i><span>${p.name}</span>`);
      chip.style.color = '#ff8f6a';
      chip.title = `${p.note}\n\n${p.effects.length} structures affected${
        p.unresolved.length ? ` · ${p.unresolved.length} unresolved` : ''
      }`;
      chip.addEventListener('click', () => this._togglePathology(p.id));
      host.appendChild(chip);
      this._pathChips.set(p.id, chip);
    }
    this.syncPathologies();
  }

  _togglePathology(pid) {
    if (!entitlements.require('data.pathology', { set: pid })) return;
    const p = this.props.pathologies.get(pid);
    if (!p) return;
    if (p.applied) {
      this.props.clearPathology(pid, this.store);
      this.hud.toast(`Cleared <b>${p.name}</b>`, 2200);
    } else {
      const n = this.props.applyPathology(pid, this.store);
      this.hud.toast(`<b>${p.name}</b> applied to ${n} structures — watch the telemetry`, 3600);
    }
    this.syncPathologies();
  }

  syncPathologies() {
    let note = '';
    for (const [pid, chip] of this._pathChips) {
      const p = this.props.pathologies.get(pid);
      chip.classList.toggle('on', !!p?.applied);
      if (p?.applied) note = p.note;
    }
    this.premium.decorateChips([...this._pathChips.values()], 'data.pathology');
    const n = el('#pathology-note');
    if (n) n.textContent = note;
  }

  /* ============================================================
     Measurement
     ============================================================ */

  _buildMeasure() {
    const host = el('#measure-controls');
    host.innerHTML = '';

    const row = make('div', 'ctrl');
    row.innerHTML = `<span class="ctrl-lbl">Tool</span><span class="ctrl-val" id="measure-hint-val"></span>`;
    const seg = make('div', 'ctrl-seg');
    this._measureButtons = new Map();
    const mk = (id, name, title) => {
      const b = make('button', '', name);
      b.title = title;
      b.addEventListener('click', () => this.setMeasureMode(this.measureMode === id ? null : id));
      seg.appendChild(b);
      this._measureButtons.set(id, b);
    };
    mk(null, 'Off', 'Return to normal selection');
    for (const m of MEASURE_MODES) mk(m.id, m.name, m.hint);
    row.appendChild(seg);
    host.appendChild(row);

    this._measureHint = make('p', 'pnote');
    this._measureHint.textContent = 'Pick a tool, then click the model.';
    host.appendChild(this._measureHint);

    el('#btn-annotate').addEventListener('click', () => this.actions.armAnnotation?.());
    el('#btn-measure-clear').addEventListener('click', () => {
      if (!entitlements.require('tool.measure')) return;
      this.measures.clear();
      this.annotations.clear();
      this.setMeasureMode(null);
      this.renderMeasureList();
      this.hud.toast('Measurements and notes cleared');
    });

    this.setMeasureMode(null);
  }

  setMeasureMode(id) {
    if (id && !entitlements.require('tool.measure', { mode: id })) return;
    this.measureMode = id;
    this.measures.cancelPending();
    for (const [k, b] of this._measureButtons) b.classList.toggle('on', k === id);
    const m = MEASURE_MODES.find((x) => x.id === id);
    this._measureHint.textContent = m ? m.hint : 'Pick a tool, then click the model.';
    document.getElementById('stage')?.classList.toggle('measuring', !!id);
  }

  renderMeasureList() {
    const host = el('#measure-list');
    host.innerHTML = '';
    const items = [...this.measures.items];
    if (!items.length && !this.annotations.count) {
      host.innerHTML = `<p class="pnote">No measurements or notes yet.</p>`;
      return;
    }
    for (const m of items) {
      const label =
        m.kind === 'distance'
          ? `${m.aName} → ${m.bName}`
          : `${m.kind === 'tension' ? 'Tension' : 'Signal'} · ${m.aName}`;
      const item = make(
        'div',
        'rest-item proj',
        `<i></i><span>${label}</span><em>${m.label || ''}</em><button title="Remove">×</button>`
      );
      item.querySelector('button').addEventListener('click', () => {
        this.measures.remove(m.id);
        this.renderMeasureList();
      });
      host.appendChild(item);
    }
    if (this.annotations.count) {
      const item = make(
        'div',
        'rest-item proj',
        `<i style="background:var(--amber)"></i><span>${this.annotations.count} note${
          this.annotations.count > 1 ? 's' : ''
        }</span><em></em><button title="Remove all notes">×</button>`
      );
      item.querySelector('button').addEventListener('click', () => {
        this.annotations.clear();
        this.renderMeasureList();
      });
      host.appendChild(item);
    }
  }

  /* ============================================================
     Projects
     ============================================================ */

  _buildProjects() {
    el('#btn-proj-save').addEventListener('click', () => {
      if (!entitlements.require('data.projects')) return;
      const name = el('#proj-name').value;
      const res = this.projects.save(name);
      if (res.ok) {
        el('#proj-name').value = '';
        this.hud.toast(`Saved <b>${res.name}</b>`);
      } else {
        this.hud.toast('Could not save — browser storage is unavailable');
      }
      this.renderProjectList();
    });

    el('#btn-proj-export').addEventListener('click', () => {
      if (!entitlements.require('data.export')) return;
      const name = el('#proj-name').value || 'continuum-scene';
      const json = this.projects.exportJson(name);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name.replace(/[^\w-]+/g, '-')}.continuum.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
      this.hud.toast(`Exported <b>${(json.length / 1024).toFixed(1)} kB</b> of scene data`);
    });

    const file = el('#proj-file');
    el('#btn-proj-import').addEventListener('click', () => {
      if (!entitlements.require('data.projects')) return;
      file.click();
    });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const text = await f.text();
      const res = this.projects.importJson(text);
      file.value = '';
      this._reportLoad(res, f.name);
    });

    this.renderProjectList();
  }

  _reportLoad(res, label) {
    if (!res.ok) {
      this.hud.toast(`Could not load — ${res.reason}`, 4000);
      return;
    }
    const r = res.report;
    const parts = [`Loaded <b>${label}</b>`];
    if (r.applied) parts.push(`${r.applied} intervention${r.applied > 1 ? 's' : ''}`);
    if (r.unresolved.length) parts.push(`${r.unresolved.length} unresolved ID${r.unresolved.length > 1 ? 's' : ''}`);
    if (r.manifestMatch === false) parts.push('built against a different model revision');
    this.hud.toast(parts.join(' · '), 4600);
    this.actions.afterProjectLoad?.();
    this.renderMeasureList();
    this.renderProjectList();
  }

  renderProjectList() {
    const host = el('#proj-list');
    host.innerHTML = '';
    const list = this.projects.list();
    if (!list.length) {
      host.innerHTML = `<p class="pnote">No saved scenes. A scene stores layers, camera, applied loads, notes and measurements — all keyed by anatomical ID.</p>`;
      return;
    }
    for (const p of list) {
      const when = new Date(p.saved);
      const item = make(
        'div',
        'rest-item proj',
        `<i></i><span>${p.name}</span><em>${when.toLocaleDateString()}</em>` +
          `<button class="pj-load" title="Load">load</button><button class="pj-del" title="Delete">×</button>`
      );
      item.title = `${p.structures?.annotations || 0} notes · ${p.structures?.measurements || 0} measurements`;
      item.querySelector('.pj-load').addEventListener('click', () => {
        const res = this.projects.load(p.name);
        this._reportLoad(res, p.name);
      });
      item.querySelector('.pj-del').addEventListener('click', () => {
        this.projects.remove(p.name);
        this.renderProjectList();
      });
      host.appendChild(item);
    }
  }

  static get formatLength() {
    return formatLength;
  }
}
