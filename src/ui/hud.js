/* ============================================================
   HUD: telemetry meters, the afferent trace, scale readout,
   tooltips, toasts and the top bar.

   The meters are the product's instrumentation. Each one reports a
   quantity the simulation actually computes, with a one-line note
   saying how to read it — the point is that a user can watch a
   restriction propagate through the numbers, not just the picture.
   ============================================================ */

import { el, make, clamp, lerp, formatLength } from '../core/util.js';
import { SCALES } from '../core/store.js';
import { RECEPTORS } from '../anatomy/info.js';
import { entitlements, CAPABILITIES } from '../platform/entitlements.js';

/**
 * The instrument strip.
 *
 * `cap` marks a meter as part of the advanced read-out. Meters without one form
 * the basic strip every tier sees: overall network load, global tension, simple
 * fidelity, and the living-body rhythms. Gated meters keep their label and their
 * note — the point of showing a locked instrument is that the user can see what
 * it would tell them.
 */
const METERS = [
  {
    id: 'load',
    label: 'Network load',
    unit: '%',
    note: 'RMS tension, 100 % = resting pre-tension',
    color: '#4fd6e0',
    hi: true,
    max: 220,
  },
  {
    id: 'peak',
    label: 'Peak rise',
    unit: '%',
    note: 'greatest local increase above rest',
    color: '#ffcf6b',
    hi: true,
    max: 160,
  },
  {
    id: 'asym',
    label: 'L/R asymmetry',
    unit: '%',
    note: 'tension imbalance across the midline',
    color: '#a58cff',
    hi: true,
    // a cross-midline comparison read-out
    cap: 'telemetry.advanced',
  },
  {
    id: 'integrity',
    label: 'Signal integrity',
    unit: '%',
    note: 'composite of fidelity, timing, bandwidth',
    color: '#4fe0a0',
    hi: false,
  },
  {
    id: 'fidelity',
    label: 'Fidelity',
    unit: '%',
    note: 'event amplitude surviving the tissue',
    color: '#4fe0a0',
    hi: false,
  },
  {
    id: 'latency',
    label: 'Added latency',
    unit: 'ms',
    note: 'delay beyond the healthy-tissue baseline',
    color: '#ff8f6a',
    hi: true,
    max: 90,
    cap: 'telemetry.advanced',
  },
  {
    id: 'bandwidth',
    label: 'Bandwidth',
    unit: '%',
    note: 'high-frequency content still arriving',
    color: '#79e6cf',
    hi: false,
    cap: 'telemetry.advanced',
  },
  {
    id: 'firing',
    label: 'Afferent rate',
    unit: 'Hz',
    note: 'summed population firing',
    color: '#f0b429',
    hi: false,
    max: 700,
  },
  {
    id: 'excursion',
    label: 'Breath excursion',
    unit: '%',
    note: 'achieved vs. commanded diaphragm travel',
    color: '#78c0ff',
    hi: false,
  },
  {
    id: 'fluid',
    label: 'Fluid transport',
    unit: '%',
    note: 'venous return and lymph drainage',
    color: '#9fe86b',
    hi: false,
  },
];

export class Hud {
  constructor(store, scales, afferent, physio, solver) {
    this.store = store;
    this.scales = scales;
    this.afferent = afferent;
    this.physio = physio;
    this.solver = solver;

    this.meters = new Map();
    this._buildMeters();
    this._buildScaleRail();

    this.tooltip = el('#tooltip');
    this.toasts = el('#toasts');
    this.sbText = el('#sb-text');
    this.sbLine = el('#scalebar .sb-line');
    this.traceLabel = el('#trace-label');
    this.canvas = el('#trace-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.perf = el('#perf');
    this.perfFps = el('#perf-fps');

    this._fpsAcc = 0;
    this._fpsN = 0;
    this._fpsShown = 0;
    this._resizeTrace();
    window.addEventListener('resize', () => this._resizeTrace());

    this._buildPerfPanel();
  }

  /* ============================================================
     Frame diagnostics
     ============================================================ */

  _buildPerfPanel() {
    this.perfPanel = el('#perfpanel');
    this.perfTier = el('#pp-tier');
    this.perfNote = el('#pp-note');
    this.perfGpu = el('#pp-gpu');
    this.perfLog = el('#pp-log');
    this._logOpen = false;

    el('#pp-toggle-log').addEventListener('click', () => {
      this._logOpen = !this._logOpen;
      this.perfLog.hidden = !this._logOpen;
      el('#pp-toggle-log').classList.toggle('on', this._logOpen);
      if (this._logOpen) this._renderLog();
    });
    el('#pp-copy').addEventListener('click', () => this.onCopyDiagnostics?.());

    const host = el('#pp-rows');
    host.innerHTML = '';
    this.perfRows = new Map();
    const rows = [
      ['fps', 'fps'],
      ['frame', 'frame'],
      ['cpu', 'sim'],
      ['scale', 'scale'],
      ['res', 'buffer'],
      ['draws', 'draws'],
      ['tris', 'tris'],
      ['field', 'endings'],
      ['beads', 'beads'],
      ['geom', 'geometry'],
    ];
    for (const [id, label] of rows) {
      host.appendChild(make('dt', '', label));
      const dd = make('dd', '', '—');
      host.appendChild(dd);
      this.perfRows.set(id, dd);
    }
  }

  perfVisible(on) {
    if (this.perfPanel) this.perfPanel.hidden = !on;
  }

  /** Actual render-buffer dimensions, which are the render scale made concrete. */
  setBufferSize(w, h) {
    this._buffer = `${w}×${h}`;
  }

  _setPerfRow(id, text, grade) {
    const dd = this.perfRows.get(id);
    if (!dd) return;
    if (dd.textContent !== text) dd.textContent = text;
    const cls = grade || '';
    if (dd.className !== cls) dd.className = cls;
  }

  /**
   * Frame diagnostics. Fed at the UI cadence, not per frame — reading
   * `renderer.info` is free but writing ten DOM nodes 60 times a second is not,
   * and the point of a performance panel is to not be part of the problem.
   */
  /** Auto's decision list, rendered only while the log is open. */
  _renderLog() {
    const rows = this._decisions || [];
    if (!rows.length) {
      this.perfLog.innerHTML = `<div><em>no decisions yet</em></div>`;
      return;
    }
    this.perfLog.innerHTML = rows
      .slice()
      .reverse()
      .map(
        (d) =>
          `<div><b>+${d.at}s</b><span>${d.kind}</span><em title="${d.detail} — ${d.fps} fps, ${d.frameMs} ms">${d.detail}</em></div>`
      )
      .join('');
  }

  updatePerf({ quality, info, cpuMs, endings, beads, decisions }) {
    if (!this.perfPanel || this.perfPanel.hidden) return;
    const buffer = this._buffer || '—';
    this._decisions = decisions;
    const fps = quality.fps;
    this.perfTier.textContent = `${quality.tierName}${quality.mode === 'auto' ? ' · auto' : ''}`;
    this._setPerfRow('fps', fps.toFixed(0), fps < 26 ? 'bad' : fps < 48 ? 'warn' : 'good');
    this._setPerfRow('frame', `${quality.frameMs.toFixed(1)} ms`);
    this._setPerfRow('cpu', `${cpuMs.toFixed(2)} ms`);
    this._setPerfRow('scale', `${quality.dpr.toFixed(2)}×`, quality.dpr < quality.cap - 0.02 ? 'warn' : '');
    this._setPerfRow('res', buffer);
    this._setPerfRow('draws', String(info.render.calls));
    this._setPerfRow('tris', `${(info.render.triangles / 1000).toFixed(0)}k`);
    this._setPerfRow('field', String(endings));
    this._setPerfRow('beads', String(beads));
    this._setPerfRow('geom', quality.geometry);
    this.perfNote.textContent = quality.shortfall
      ? 'Geometry was tessellated for the detected hardware; reload to rebuild it at full detail.'
      : quality.mode === 'auto'
        ? `holding 60 fps · last change: ${quality.action}`
        : 'fixed tier — Auto will not adjust';

    /* The GPU string is what tells a tester whether they are looking at real
       hardware at all. A software rasteriser produces numbers that mean nothing
       about a real GPU, and mistaking one for the other wastes a test session. */
    if (this._gpuShown !== quality.gpu) {
      this._gpuShown = quality.gpu;
      const soft = /swiftshader|llvmpipe|softpipe|mesa offscreen|basic render/i.test(quality.gpu || '');
      this.perfGpu.innerHTML = quality.gpu
        ? `${soft ? '<b style="color:var(--coral)">SOFTWARE RASTERISER — not indicative of GPU performance</b><br>' : ''}${quality.gpu}`
        : 'GPU not reported by this browser';
    }

    if (this._logOpen) this._renderLog();
  }

  _buildMeters() {
    const host = el('#tm-meters');
    host.innerHTML = '';
    for (const m of METERS) {
      const node = make('div', 'meter');
      node.innerHTML = `
        <div class="mt-top">
          <span class="mt-lbl">${m.label}</span>
          <span class="mt-val">—<small>${m.unit}</small></span>
        </div>
        <div class="mt-track"><div class="mt-fill" style="background:${m.color}"></div></div>
        <div class="mt-note">${m.note}</div>`;
      node.title = `${m.label} — ${m.note}`;
      host.appendChild(node);
      this.meters.set(m.id, {
        def: m,
        node,
        val: node.querySelector('.mt-val'),
        fill: node.querySelector('.mt-fill'),
        note: node.querySelector('.mt-note'),
        last: -1,
        locked: false,
      });
    }
    this.syncEntitlements();
  }

  /**
   * Re-read the licence and lock the advanced meters and the afferent trace.
   * A locked meter shows its label, its note and a lock rather than a value, and
   * clicking it opens the plan.
   */
  syncEntitlements() {
    const advanced = entitlements.can('telemetry.advanced');
    for (const [, m] of this.meters) {
      const locked = !!m.def.cap && !entitlements.can(m.def.cap);
      m.locked = locked;
      m.node.classList.toggle('locked', locked);
      if (locked) {
        m.val.innerHTML = `<i class="ic-lock"></i>`;
        m.fill.style.width = '0%';
        m.last = -1;
        m.node.title = `${m.def.label} — Professional. ${CAPABILITIES[m.def.cap]?.blurb || ''}`;
        if (!m.node._upsell) {
          m.node._upsell = true;
          m.node.style.cursor = 'pointer';
          m.node.addEventListener('click', () => this.onLockedClick?.(m.def.cap, m.def.label));
        }
      } else {
        m.node.title = `${m.def.label} — ${m.def.note}`;
        m.node.style.cursor = '';
      }
    }

    // the afferent trace is a per-receptor read-out
    const trace = el('#tm-trace');
    if (trace) {
      trace.classList.toggle('locked', !advanced);
      let veil = trace.querySelector('.trace-veil');
      if (!advanced && !veil) {
        veil = make(
          'div',
          'trace-veil',
          `<b><i class="ic-lock"></i>Afferent trace</b><span>Watch the true mechanical event and what the ending
           actually receives, side by side, for any receptor class.</span>`
        );
        veil.addEventListener('click', () => this.onLockedClick?.('telemetry.advanced', 'Afferent trace'));
        trace.appendChild(veil);
      } else if (advanced && veil) {
        veil.remove();
      }
    }
  }

  _buildScaleRail() {
    const rail = el('#scale-rail');
    rail.innerHTML = '';
    this.railButtons = SCALES.map((s, i) => {
      const b = make('button', 'sc-btn', `${s.name}<small>${s.note}</small>`);
      b.dataset.index = String(i);
      b.title = `Traverse to the ${s.name.toLowerCase()} scale (${s.note})`;
      rail.appendChild(b);
      return b;
    });
    return this.railButtons;
  }

  onScaleClick(fn) {
    this.railButtons.forEach((b, i) => b.addEventListener('click', () => fn(i)));
  }

  _resizeTrace() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(76 * dpr);
    this.dpr = dpr;
  }

  setMeter(id, value, display, note) {
    const m = this.meters.get(id);
    if (!m || m.locked) return;
    const max = m.def.max ?? 100;
    const pct = clamp((value / max) * 100, 0, 100);
    if (Math.abs(pct - m.last) > 0.4) {
      m.fill.style.width = `${pct}%`;
      m.last = pct;
    }
    m.val.innerHTML = `${display}<small>${m.def.unit}</small>`;
    // meters where "more" is bad warm up as they climb; where "more" is good, cool down as they fall
    const bad = m.def.hi ? pct / 100 : 1 - pct / 100;
    m.fill.style.backgroundColor = bad > 0.78 ? '#ff6f52' : bad > 0.52 ? '#f0b429' : m.def.color;
    if (note) m.note.textContent = note;
  }

  update(dt) {
    /* ---------- fps ---------- */
    this._fpsAcc += dt;
    this._fpsN++;
    if (this._fpsAcc >= 0.5) {
      const fps = this._fpsN / this._fpsAcc;
      this._fpsShown = fps;
      this.perfFps.textContent = fps.toFixed(0);
      this.perf.className = `tb-perf${fps < 26 ? ' bad' : fps < 48 ? ' warn' : ''}`;
      this._fpsAcc = 0;
      this._fpsN = 0;
    }

    /* ---------- meters ---------- */
    const s = this.solver;
    const su = this.afferent.summary;
    const po = this.physio.out;
    const loadPct = (s.metrics.rms / Math.max(1e-6, s.baseRms)) * 100;
    this.setMeter(
      'load',
      loadPct,
      loadPct.toFixed(0),
      s.baselineReady ? 'RMS tension, 100 % = resting pre-tension' : 'capturing resting baseline…'
    );
    const peakPct = clamp(s.metrics.peakDev, 0, 1.6) * 100;
    this.setMeter('peak', peakPct, `+${peakPct.toFixed(0)}`);
    const asym = Math.abs(s.metrics.asymmetry) * 100;
    this.setMeter(
      'asym',
      asym,
      asym.toFixed(1),
      s.metrics.asymmetry > 0.01 ? 'loaded toward the left' : s.metrics.asymmetry < -0.01 ? 'loaded toward the right' : 'balanced across the midline'
    );

    this.setMeter('integrity', su.integrity * 100, (su.integrity * 100).toFixed(0));
    this.setMeter('fidelity', su.fidelity * 100, (su.fidelity * 100).toFixed(0));
    this.setMeter(
      'latency',
      su.latencyAdded,
      `+${su.latencyAdded.toFixed(su.latencyAdded < 10 ? 1 : 0)}`,
      `${su.latency.toFixed(0)} ms total · baseline ${su.latencyBaseline.toFixed(0)} ms`
    );
    this.setMeter('bandwidth', clamp(su.bandwidth, 0, 1) * 100, (clamp(su.bandwidth, 0, 1) * 100).toFixed(0));
    this.setMeter('firing', su.firing, su.firing.toFixed(0));
    this.setMeter(
      'excursion',
      po.excursionRatio * 100,
      (po.excursionRatio * 100).toFixed(0),
      `${(po.tidalActual * 1000).toFixed(1)} mm of ${(po.tidalDemand * 1000).toFixed(1)} mm commanded`
    );
    const fluid = ((po.venousReturn + po.lymphFlow) / 2) * 100;
    this.setMeter(
      'fluid',
      clamp(fluid, 0, 100),
      fluid.toFixed(0),
      `return ${(po.venousReturn * 100).toFixed(0)} % · lymph ${(po.lymphFlow * 100).toFixed(0)} %`
    );

    /* ---------- scale bar ---------- */
    const bar = this.scales.bar(window.innerHeight);
    this.sbLine.style.width = `${clamp(bar.px, 26, 220)}px`;
    this.sbText.textContent = `${bar.text}  ·  ${this.scales.tierLabel}${bar.toScale ? '  ·  endings at true size' : ''}`;

    /* ---------- trace ---------- */
    this._drawTrace();
  }

  _drawTrace() {
    const c = this.ctx;
    // per-receptor read-out; nothing to draw when the licence does not cover it
    if (!c || !entitlements.can('telemetry.advanced')) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const dpr = this.dpr || 1;
    c.clearRect(0, 0, W, H);

    const pop = this.afferent.focus;
    if (!pop) return;

    /* grid */
    c.strokeStyle = 'rgba(140,176,200,0.12)';
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }

    const n = pop.trace.n;
    // auto-range against the recent window: resting drive is a few percent of full
    // scale, and a flat line pinned to the axis tells the user nothing
    const hi = Math.max(pop.trace.minmax()[1], pop.idealTrace.minmax()[1]);
    this._traceScale = this._traceScale ? lerp(this._traceScale, Math.max(0.1, hi * 1.2), 0.08) : Math.max(0.1, hi * 1.2);
    const scale = 1 / this._traceScale;

    const drawSeries = (ring, color, width, alpha) => {
      c.strokeStyle = color;
      c.globalAlpha = alpha;
      c.lineWidth = width * dpr;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const v = ring.at(n - 1 - k) * scale;
        const x = (k / (n - 1)) * W;
        const y = H - 3 * dpr - clamp(v, 0, 1) * (H - 8 * dpr);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.globalAlpha = 1;
    };

    // the mechanical event as it actually is, then what the ending receives
    drawSeries(pop.idealTrace, 'rgba(220,232,240,0.55)', 1, 0.7);
    drawSeries(pop.trace, pop.def.color, 1.6, 1);

    // firing tick marks along the top, at the current rate
    const hz = pop.rate;
    if (hz > 0.4) {
      c.fillStyle = pop.def.color;
      const spacing = Math.max(4 * dpr, (W / Math.max(1, hz)) * 0.55);
      const drift = (performance.now() * 0.001 * hz * spacing) % spacing;
      for (let x = W - drift; x > 0; x -= spacing) {
        c.fillRect(x, 2 * dpr, 1.2 * dpr, 6 * dpr);
      }
    }

    this.traceLabel.textContent = `${pop.def.short} · ${pop.rate.toFixed(0)} Hz · fidelity ${(pop.fidelity * 100).toFixed(0)} % · ${pop.latency.toFixed(0)} ms`;
  }

  /* ---------------- tooltip ---------------- */

  showTooltip(x, y, html) {
    const t = this.tooltip;
    t.hidden = false;
    t.innerHTML = html;
    const w = t.offsetWidth;
    const flip = x + w + 30 > window.innerWidth;
    t.style.left = `${flip ? x - w - 16 : x}px`;
    t.style.top = `${clamp(y, 40, window.innerHeight - 40)}px`;
    t.style.transform = flip ? 'translate(0, -50%)' : 'translate(12px, -50%)';
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }

  /* ---------------- toasts ---------------- */

  toast(html, ms = 2600) {
    const n = make('div', 'toast', html);
    this.toasts.appendChild(n);
    setTimeout(() => {
      n.classList.add('out');
      setTimeout(() => n.remove(), 420);
    }, ms);
  }

  /* ---------------- helpers ---------------- */

  static receptorChipHtml(id) {
    const r = RECEPTORS[id];
    return `<i style="color:${r.color}"></i><span>${r.short}</span>`;
  }

  static formatLength = formatLength;
}
