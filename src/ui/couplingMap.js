/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Coupling map — which regions are exchanging tension this frame.

   A teaching map computed from the live solve: each region's mean
   positive tension deviation from rest, and each pair's
   co-elevation (the geometric mean of the two). Load the plantar
   fascia and the plantar–calf–lumbar cells warm together — the
   continuity demonstration as a matrix.

   This is NOT measured connectivity. It is arithmetic over the
   model's own solved state, and the pane header says so.
   ============================================================ */

import { el, clamp } from '../core/util.js';

const REGIONS = [
  { id: 'plantar', name: 'plantar', test: (x, y) => y < 0.09 },
  { id: 'leg', name: 'leg', test: (x, y) => y >= 0.09 && y < 0.52 },
  { id: 'thigh', name: 'thigh', test: (x, y) => y >= 0.52 && y < 0.94 },
  { id: 'pelvis', name: 'pelvis', test: (x, y) => y >= 0.94 && y < 1.1 && Math.abs(x) < 0.24 },
  { id: 'lumbar', name: 'lumbar', test: (x, y) => y >= 1.1 && y < 1.28 && Math.abs(x) < 0.24 },
  { id: 'thorax', name: 'thorax', test: (x, y) => y >= 1.28 && y < 1.52 && Math.abs(x) < 0.24 },
  { id: 'cervical', name: 'cervical', test: (x, y) => y >= 1.52 && y < 1.63 },
  { id: 'cranium', name: 'cranium', test: (x, y) => y >= 1.63 },
  { id: 'arms', name: 'arms', test: (x, y) => Math.abs(x) >= 0.24 && y >= 0.94 && y < 1.6 },
];

export class CouplingMap {
  constructor({ solver, registry, store, hud }) {
    this.solver = solver;
    this.registry = registry;
    this.store = store;
    this.hud = hud;

    this.canvas = el('#coupling-canvas');
    if (!this.canvas) return;
    this.c2d = this.canvas.getContext('2d');

    /* node → region, once. The per-region signal is the mean of the solver's
       own per-node load field — the same deviation-from-baseline quantity the
       receptor populations read, so this pane and the 3D view cannot disagree. */
    const s = solver;
    this.nodeRegion = new Int8Array(s.count).fill(-1);
    for (let i = 0; i < s.count; i++) {
      const x = s.home[i * 3];
      const y = s.home[i * 3 + 1];
      for (let r = 0; r < REGIONS.length; r++) {
        if (REGIONS[r].test(x, y)) {
          this.nodeRegion[i] = r;
          break;
        }
      }
    }

    /* structure → region, once, for click-to-select */
    this.regionStructures = REGIONS.map(() => []);
    for (const st of registry.list) {
      for (let r = 0; r < REGIONS.length; r++) {
        if (REGIONS[r].test(st.center.x, st.center.y)) {
          this.regionStructures[r].push(st.key);
          break;
        }
      }
    }

    this.dev = new Float32Array(REGIONS.length);
    this._acc = 1;

    this.canvas.addEventListener('click', (e) => this._click(e));
    this.canvas.addEventListener('mousemove', (e) => this._hover(e));
    this.canvas.style.cursor = 'pointer';
  }

  _cellAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pad = this._pad / (this.canvas.width / rect.width);
    const cell = this._cell / (this.canvas.width / rect.width);
    const i = Math.floor((e.clientX - rect.left - pad) / cell);
    const j = Math.floor((e.clientY - rect.top - pad) / cell);
    if (i < 0 || j < 0 || i >= REGIONS.length || j >= REGIONS.length) return null;
    return { i, j };
  }

  _hover(e) {
    const c = this._cellAt(e);
    this.canvas.title = c
      ? `${REGIONS[c.i].name} × ${REGIONS[c.j].name} — co-elevated tension in the model this frame. Click to select both regions.`
      : '';
  }

  _click(e) {
    const c = this._cellAt(e);
    if (!c) return;
    const keys = [...new Set([...this.regionStructures[c.i], ...this.regionStructures[c.j]])];
    if (!keys.length) return;
    this.store.clearSelection();
    // respect the selection entitlement: select() itself enforces multi-select
    let n = 0;
    for (const k of keys) {
      this.store.select(k, n > 0);
      n++;
      if (n >= 14) break;
    }
    this.hud.toast(
      `Coupling cell <b>${REGIONS[c.i].name} × ${REGIONS[c.j].name}</b> — ${Math.min(n, keys.length)} structures selected`,
      2600
    );
  }

  update(dt) {
    if (!this.canvas) return;
    this._acc += dt;
    if (this._acc < 0.25) return; // 4 Hz is plenty for a matrix
    this._acc = 0;

    /* Mean load per region, from the solver's node field, expressed relative
       to the whole-body mean. The map answers "which regions carry MORE than
       the body as a whole right now" — at rest it reads near-blank, and a
       plantar load lights the plantar–calf–lumbar cells together. */
    const s = this.solver;
    const sums = new Float32Array(REGIONS.length);
    const counts = new Float32Array(REGIONS.length);
    let gSum = 0;
    let gN = 0;
    for (let i = 0; i < s.count; i++) {
      const r = this.nodeRegion[i];
      if (r < 0) continue;
      const v = Math.max(0, s.load[i]);
      sums[r] += v;
      counts[r]++;
      gSum += v;
      gN++;
    }
    const gMean = gN ? gSum / gN : 0;
    for (let r = 0; r < REGIONS.length; r++) {
      const mean = counts[r] ? sums[r] / counts[r] : 0;
      this.dev[r] = Math.max(0, mean - gMean * 0.9);
    }

    this._draw();
  }

  _draw() {
    const c = this.c2d;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 260;
    const hCss = Math.min(190, w * 0.72);
    if (this.canvas.width !== Math.floor(w * dpr)) this.canvas.width = Math.floor(w * dpr);
    if (this.canvas.height !== Math.floor(hCss * dpr)) this.canvas.height = Math.floor(hCss * dpr);
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);

    const n = REGIONS.length;
    const pad = Math.floor(54 * dpr * 0.9);
    const cell = Math.floor(Math.min((W - pad - 2) / n, (H - pad * 0.42 - 2) / n));
    this._pad = pad;
    this._cell = cell;

    c.font = `${9.5 * dpr}px ui-monospace, monospace`;
    c.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = i === j ? this.dev[i] : Math.sqrt(Math.max(0, this.dev[i] * this.dev[j]));
        const t = clamp(v * 4.5, 0, 1);
        // paper → amber → copper: the locked tension ramp
        const r0 = 238 - 20 * t, g0 = 231 - 110 * t, b0 = 220 - 165 * t;
        c.fillStyle = `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`;
        c.fillRect(pad + i * cell, pad * 0.42 + j * cell, cell - 1 * dpr, cell - 1 * dpr);
      }
    }

    /* labels */
    c.fillStyle = 'rgba(70,64,52,0.9)';
    for (let j = 0; j < n; j++) {
      c.textAlign = 'right';
      c.fillText(REGIONS[j].name, pad - 4 * dpr, pad * 0.42 + j * cell + cell / 2);
    }
    c.save();
    c.textAlign = 'left';
    for (let i = 0; i < n; i++) {
      c.save();
      c.translate(pad + i * cell + cell / 2, pad * 0.42 - 3 * dpr);
      c.rotate(-Math.PI / 4);
      c.fillText(REGIONS[i].name, 0, 0);
      c.restore();
    }
    c.restore();
  }
}
