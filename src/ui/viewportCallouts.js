/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   In-viewport callout cards.

   One primary paper card on the selected structure — NAME, system,
   a two-line teaching note, and provenance when the selection came
   from a teaching overlay. A second card only for a multi-select.
   Never more than two floating cards; everything else lives in the
   chrome. Leader lines are short and stable: the card sits at a
   fixed offset from the projected anchor and clamps to the frame.
   ============================================================ */

import * as THREE from 'three';
import { el, make, clamp } from '../core/util.js';

const MAX_CARDS = 2;

export class ViewportCallouts {
  constructor({ store, registry, solver, camera, canvas, teaching }) {
    this.store = store;
    this.registry = registry;
    this.solver = solver;
    this.camera = camera;
    this.canvas = canvas;
    this.teaching = teaching;

    this.layer = make('div', 'callout-layer');
    document.getElementById('app').appendChild(this.layer);

    this.cards = [];
    for (let i = 0; i < MAX_CARDS; i++) {
      const card = make('div', 'callout' + (i ? ' secondary' : ''));
      card.hidden = true;
      this.layer.appendChild(card);
      this.cards.push({ el: card, key: null });
    }

    this._v = new THREE.Vector3();
    store.on('selection', () => this._rebuild());
  }

  _noteFor(s) {
    // two lines maximum, teaching register: what it is, then what to watch
    const role = s.info?.role || s.blurb || '';
    return role.length > 130 ? role.slice(0, 127) + '…' : role;
  }

  _rebuild() {
    const sel = [...this.store.selection].slice(0, MAX_CARDS);
    for (let i = 0; i < MAX_CARDS; i++) {
      const card = this.cards[i];
      const key = sel[i] || null;
      card.key = key;
      const s = key ? this.registry.get(key) : null;
      if (!s) {
        card.el.hidden = true;
        continue;
      }
      const layer = this.store.layer(s.layer);
      const tp = this.teaching?.selected
        ? this.teaching.resolved[this.teaching.selected.system]?.[this.teaching.selected.index]
        : null;
      const isPoint = tp && tp.structure.key === key;
      card.el.innerHTML = `
        <div class="co-line"></div>
        <div class="co-body">
          <b>${s.name}</b>
          <em style="color:${layer?.color || 'inherit'}">${layer?.name || s.layer}</em>
          ${isPoint ? `<u>◆ ${tp.point.name} · ${tp.point.confidence}</u>` : ''}
          <span>${this._noteFor(s)}</span>
        </div>`;
      card.el.hidden = false;
      card.center = s.center;
      card.node = s.nodes?.[0] ?? null;
    }
  }

  update() {
    const rect = this.canvas.getBoundingClientRect();
    for (const card of this.cards) {
      if (card.el.hidden || !card.center) continue;
      this._v.copy(card.center);
      if (card.node != null) {
        const n = card.node;
        const s = this.solver;
        this._v.x += s.pos[n * 3] - s.home[n * 3];
        this._v.y += s.pos[n * 3 + 1] - s.home[n * 3 + 1];
        this._v.z += s.pos[n * 3 + 2] - s.home[n * 3 + 2];
      }
      this._v.project(this.camera);
      if (this._v.z > 1) {
        card.el.style.opacity = '0';
        continue;
      }
      const x = rect.left + ((this._v.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - this._v.y) / 2) * rect.height;
      const panesOpen = !document.getElementById('atlas-panes')?.classList.contains('collapsed');
      // stay clear of the right panel and the bottom instrument
      const cx = clamp(x + 26, 292, window.innerWidth - 560);
      const cy = clamp(y - 30, 108, window.innerHeight - (panesOpen ? 380 : 170));
      card.el.style.transform = `translate(${cx.toFixed(0)}px, ${cy.toFixed(0)}px)`;
      card.el.style.opacity = '1';
    }
  }
}
