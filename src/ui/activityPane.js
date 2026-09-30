/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Activity pane — multi-series sparklines over a rolling window.

   Series: breath excursion, network load, afferent rate (focused
   class), efferent drive, fluid transport. Clicking a legend chip
   focuses that series; clicking a receptor-fed series also focuses
   the class in the 3D instrument. Every value is a model output.
   ============================================================ */

import { el, make, clamp } from '../core/util.js';
import { Ring } from '../core/util.js';

const WINDOWS = [20, 60, 180]; // seconds

const SERIES = [
  { id: 'breath', label: 'breath', color: '#78c0ff', get: (c) => c.physio.out.excursionRatio },
  { id: 'load', label: 'load', color: '#d9822b', get: (c) => c.solver.metrics.rms / Math.max(1e-6, c.solver.baseRms) },
  { id: 'afferent', label: 'afferent', color: '#39c2d7', get: (c) => clamp(c.afferent.summary.firing / 400, 0, 1.4) },
  { id: 'efferent', label: 'efferent', color: '#d7a13b', get: (c) => c.efferent.out.drive },
  { id: 'fluid', label: 'fluid', color: '#a9b285', get: (c) => (c.physio.out.venousReturn + c.physio.out.lymphFlow) / 2 },
];

export class ActivityPane {
  constructor(ctx) {
    this.ctx = ctx; // { physio, solver, afferent, efferent, onFocusSeries }
    this.host = el('#activity-spark');
    if (!this.host) return;
    this.windowS = 60;
    this.focus = null;
    this.rings = new Map(SERIES.map((s) => [s.id, new Ring(360)]));
    this._acc = 0;

    this.host.innerHTML = '';
    const head = make('div', 'spark-head');
    this.legend = make('div', 'spark-legend');
    for (const s of SERIES) {
      const chip = make('button', 'spark-chip', `<i style="background:${s.color}"></i>${s.label}`);
      chip.title = `${s.label} — model output, not a measurement. Click to isolate the series.`;
      chip.addEventListener('click', () => {
        this.focus = this.focus === s.id ? null : s.id;
        for (const c of this.legend.children) c.classList.toggle('on', c === chip && this.focus === s.id);
        this.ctx.onFocusSeries?.(this.focus);
      });
      this.legend.appendChild(chip);
    }
    head.appendChild(this.legend);
    this.winBtn = make('button', 'mini', '60 s');
    this.winBtn.title = 'Time window';
    this.winBtn.addEventListener('click', () => {
      const i = (WINDOWS.indexOf(this.windowS) + 1) % WINDOWS.length;
      this.windowS = WINDOWS[i];
      this.winBtn.textContent = `${this.windowS} s`;
    });
    head.appendChild(this.winBtn);
    this.host.appendChild(head);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'spark-canvas';
    this.canvas.height = 64;
    this.host.appendChild(this.canvas);
    this.c2d = this.canvas.getContext('2d');
  }

  /** Sample at ~6 Hz — a sparkline does not need frame-rate data. */
  update(dt) {
    if (!this.host) return;
    this._acc += dt;
    if (this._acc < 1 / 6) return;
    this._acc = 0;
    for (const s of SERIES) this.rings.get(s.id).push(clamp(s.get(this.ctx), 0, 1.6));
    this._draw();
  }

  _draw() {
    const c = this.c2d;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 280;
    if (this.canvas.width !== Math.floor(w * dpr)) this.canvas.width = Math.floor(w * dpr);
    if (this.canvas.height !== Math.floor(64 * dpr)) this.canvas.height = Math.floor(64 * dpr);
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);

    c.strokeStyle = 'rgba(232,224,210,0.12)';
    c.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const y = (H / 3) * i;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }

    const samples = Math.min(360, Math.round(this.windowS * 6));
    for (const s of SERIES) {
      const dim = this.focus && this.focus !== s.id;
      const ring = this.rings.get(s.id);
      const n = Math.min(ring.filled, samples);
      if (n < 2) continue;
      c.strokeStyle = s.color;
      c.globalAlpha = dim ? 0.18 : 0.95;
      c.lineWidth = (this.focus === s.id ? 2 : 1.2) * dpr;
      c.beginPath();
      // right-anchored: now sits at the right edge, history flows left
      for (let k = 0; k < n; k++) {
        const v = clamp(ring.at(k) / 1.2, 0, 1);
        const x = W - (k / (samples - 1)) * W;
        const y = H - 2 * dpr - v * (H - 6 * dpr);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
}
