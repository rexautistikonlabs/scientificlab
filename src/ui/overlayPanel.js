/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Teaching-overlay panel.

   Three system toggles, a density control, the point list for
   whichever systems are on, and the selected point's provenance.
   Every surface carries the standing caption; there is no
   treatment copy anywhere in this panel by design.
   ============================================================ */

import { el, make } from '../core/util.js';
import { TEACHING_SYSTEMS, OVERLAY_CAPTION } from '../platform/overlays.js';
import { OVERLAY_COLORS } from '../gfx/anatomyMaterials.js';
import { entitlements } from '../platform/entitlements.js';

const SYMBOL = { chiropractic: '◆', acupuncture: '⧫', massage: '⬬' };

export class OverlayPanel {
  constructor({ store, teaching, solver, hud, onFly }) {
    this.store = store;
    this.teaching = teaching;
    this.solver = solver;
    this.hud = hud;
    this.onFly = onFly;

    this.host = el('#overlay-teaching');
    if (!this.host) return;
    this._build();
    store.on('teachingOverlays', () => this.sync());
    this.sync();
  }

  _build() {
    const h = this.host;
    h.innerHTML = '';

    /* system chips */
    this.chipRow = make('div', 'chip-grid');
    this.chips = new Map();
    for (const [sysId, set] of Object.entries(TEACHING_SYSTEMS)) {
      const c = make('button', 'chip ovl-chip', `<i style="color:#${OVERLAY_COLORS[sysId].toString(16).padStart(6, '0')}">${SYMBOL[sysId]}</i><span>${set.name}</span>`);
      c.title = `${set.name}\n${set.source}\n\n${OVERLAY_CAPTION}`;
      c.addEventListener('click', () => this.store.toggleTeachingOverlay(sysId));
      this.chipRow.appendChild(c);
      this.chips.set(sysId, c);
    }
    h.appendChild(this.chipRow);

    /* density */
    const dens = make('label', 'ovl-density', `<span>Density</span>`);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '30';
    slider.max = '100';
    slider.value = String(Math.round(this.store.overlayDensity * 100));
    slider.addEventListener('input', () => this.store.setOverlayDensity(+slider.value / 100));
    dens.appendChild(slider);
    h.appendChild(dens);

    /* point list */
    this.listEl = make('div', 'ovl-list');
    h.appendChild(this.listEl);

    /* selected point detail */
    this.detailEl = make('div', 'ovl-detail');
    this.detailEl.hidden = true;
    h.appendChild(this.detailEl);

    /* demo-load reset (massage) */
    this.resetBtn = make('button', 'btn btn-sm', 'Reset demo loads');
    this.resetBtn.hidden = true;
    this.resetBtn.addEventListener('click', () => {
      const n = this.teaching.resetDemonstrations({
        solverRemove: (id) => this.solver.removeIntervention(id),
        storeRemove: (id) => this.store.removeRestriction(id),
      });
      this.hud.toast(n ? `Removed <b>${n}</b> demonstration load${n > 1 ? 's' : ''}` : 'No demonstration loads active', 2400);
      this.resetBtn.hidden = true;
    });
    h.appendChild(this.resetBtn);

    /* the standing caption — always visible while the section is */
    h.appendChild(make('p', 'pnote ovl-caption', `<b>${OVERLAY_CAPTION}</b> Symbols are teaching landmarks bound to the model's anatomy — placement is schematic and provenance is stated per point.`));
  }

  sync() {
    if (!this.host) return;
    const active = this.store.teachingOverlays;
    for (const [sysId, chip] of this.chips) chip.classList.toggle('on', active.has(sysId));

    /* list points of active systems, capped for panel sanity */
    this.listEl.innerHTML = '';
    let shown = 0;
    for (const sysId of active) {
      for (const p of this.teaching.list(sysId)) {
        if (shown >= 40) break;
        const row = make(
          'button',
          'ovl-row',
          `<i style="color:#${OVERLAY_COLORS[sysId].toString(16).padStart(6, '0')}">${SYMBOL[sysId]}</i>
           <span>${p.name}</span><em>${p.structure}</em>`
        );
        row.title = `${p.name}\nbound to ${p.anatomicalId}\nconfidence: ${p.confidence}\n${p.source}`;
        row.addEventListener('click', () => {
          const it = this.teaching.selectPoint(sysId, p.index);
          if (it) {
            this.showPoint({ system: sysId, index: p.index, ...it });
            this.onFly?.(it.structure);
          }
        });
        this.listEl.appendChild(row);
        shown++;
      }
    }
    this.listEl.hidden = shown === 0;
  }

  /** Selected-point provenance card. No treatment copy — by design. */
  showPoint(pt) {
    if (!this.host) return;
    const set = TEACHING_SYSTEMS[pt.system];
    const massage = pt.system === 'massage';
    this.detailEl.hidden = false;
    this.detailEl.innerHTML = `
      <header><i style="color:#${OVERLAY_COLORS[pt.system].toString(16).padStart(6, '0')}">${SYMBOL[pt.system]}</i>
        <b>${pt.point.name}</b></header>
      <dl>
        <dt>system</dt><dd>${set.name}</dd>
        <dt>bound to</dt><dd>${pt.structure.name}<br><code>${pt.point.anatomicalId}</code></dd>
        <dt>confidence</dt><dd>${pt.point.confidence}</dd>
        <dt>source</dt><dd>${pt.point.source}</dd>
        <dt>note</dt><dd>${pt.point.notes}</dd>
      </dl>
      <p class="pnote">${OVERLAY_CAPTION}</p>`;

    if (massage) {
      const demo = make('button', 'btn btn-sm btn-primary', 'Apply demo restriction');
      demo.title =
        'Applies a temporary, labelled restriction at this landmark through the same intervention path as the manual tools. ' +
        'A physics demonstration on the model — not a procedure. One click removes it.';
      demo.addEventListener('click', () => {
        if (!entitlements.can('tool.intervention')) {
          entitlements.require('tool.intervention', { via: 'overlay.massage' });
          return;
        }
        const id = this.teaching.applyDemonstration(pt, {
          solverAdd: (iv) => this.solver.addIntervention(iv),
          storeAdd: (rec) => this.store.addRestriction(rec),
        });
        if (id) {
          this.hud.toast(`Demonstration restriction at <b>${pt.point.name}</b> — watch the meters, then reset it`, 3600);
          this.resetBtn.hidden = false;
        }
      });
      this.detailEl.appendChild(demo);
    }
  }
}
