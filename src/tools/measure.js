/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Measurement tools.

   Three kinds, all anchored by anatomical ID wherever possible so a
   measurement survives a project reload:

     distance  between two picked points, following the tissue as it moves
     tension   a probe pinned to a structure, reading live deviation from rest
     signal    a probe reading the afferent fidelity, bandwidth and latency
               arriving from a structure

   Anchors store both an ID and a local offset from that structure's centre,
   so a probe placed on the left plantar fascia stays on the left plantar
   fascia — and moves with it as the network deforms.

   Geometry is one LineSegments for every distance measurement plus DOM
   labels, so the whole tool set costs one extra draw call.
   ============================================================ */

import * as THREE from 'three';
import { formatLength, make } from '../core/util.js';
import { entitlements } from '../platform/entitlements.js';

const MAX_MEASURES = 64;

export class Measurements {
  constructor({ registry, props, solver, camera, canvas, overlayHost }) {
    this.registry = registry;
    this.props = props;
    this.solver = solver;
    this.camera = camera;
    this.canvas = canvas;
    this.host = overlayHost;

    this.items = [];
    this._seq = 0;
    this._pending = null; // first point of a distance measurement in progress

    /* one line buffer for every distance measurement */
    const pos = new Float32Array(MAX_MEASURES * 6);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setDrawRange(0, 0);
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
    this._pos = geom.getAttribute('position');
    this.lines = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0x4fd6e0, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false })
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 30;

    /* probe markers */
    const pgeom = new THREE.BufferGeometry();
    pgeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MEASURES * 3), 3));
    pgeom.setDrawRange(0, 0);
    pgeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
    this._ppos = pgeom.getAttribute('position');
    this.points = new THREE.Points(
      pgeom,
      new THREE.PointsMaterial({
        color: 0xffcf6b,
        size: 7,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 31;

    this.group = new THREE.Group();
    this.group.name = 'measurements';
    this.group.add(this.lines, this.points);

    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._proj = new THREE.Vector3();
  }

  get count() {
    return this.items.length;
  }

  get awaitingSecondPoint() {
    return !!this._pending;
  }

  /**
   * Anchor a world point to a structure so it tracks the tissue.
   * Stores the offset in the structure's rest frame; the live position is the
   * structure's centre plus that offset plus the solved node displacement.
   */
  _anchor(point, structure) {
    if (!structure) return { id: null, offset: point.clone(), node: this.solver.nearest(point) };
    return {
      id: structure.id,
      offset: point.clone().sub(structure.center),
      node: this.solver.nearest(point),
    };
  }

  _anchorWorld(anchor, out) {
    const s = anchor.id ? this.registry.byAnatomicalId(anchor.id) : null;
    if (s) out.copy(s.center).add(anchor.offset);
    else out.copy(anchor.offset);
    // follow the solved displacement of the nearest network node
    const n = anchor.node;
    if (n >= 0) {
      out.x += this.solver.pos[n * 3] - this.solver.home[n * 3];
      out.y += this.solver.pos[n * 3 + 1] - this.solver.home[n * 3 + 1];
      out.z += this.solver.pos[n * 3 + 2] - this.solver.home[n * 3 + 2];
    }
    return out;
  }

  /* ============================================================
     Creation
     ============================================================ */

  /** Click handling for distance mode: first click sets A, second completes. */
  addDistancePoint(point, structure) {
    if (!entitlements.require('tool.measure')) return { state: 'denied' };
    if (!this._pending) {
      this._pending = { a: this._anchor(point, structure), aName: structure?.name || 'point' };
      return { state: 'awaiting' };
    }
    const item = this._make('distance', {
      a: this._pending.a,
      b: this._anchor(point, structure),
      aName: this._pending.aName,
      bName: structure?.name || 'point',
    });
    this._pending = null;
    return { state: 'complete', item };
  }

  cancelPending() {
    this._pending = null;
  }

  addProbe(kind, point, structure) {
    if (!structure) return null;
    // gated here as well as in the UI: the tool is the source of the capability,
    // and a scripted call must be refused exactly like a click
    if (!entitlements.require('tool.measure', { kind })) return null;
    return this._make(kind, { a: this._anchor(point, structure), aName: structure.name });
  }

  _make(kind, data) {
    if (this.items.length >= MAX_MEASURES) this.items.shift();
    const item = { id: `m${++this._seq}`, kind, ...data, value: 0, label: '', el: null };
    item.el = make('div', `mlabel mlabel-${kind}`, '');
    this.host.appendChild(item.el);
    this.items.push(item);
    return item;
  }

  remove(id) {
    const i = this.items.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.items[i].el?.remove();
    this.items.splice(i, 1);
  }

  clear() {
    for (const m of this.items) m.el?.remove();
    this.items.length = 0;
    this._pending = null;
  }

  setVisible(v) {
    this.group.visible = v;
    for (const m of this.items) if (m.el) m.el.style.display = v ? '' : 'none';
  }

  /* ============================================================
     Per-frame update
     ============================================================ */

  update() {
    if (!this.group.visible) return;
    const lp = this._pos.array;
    const pp = this._ppos.array;
    let lineN = 0;
    let pointN = 0;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;

    for (const m of this.items) {
      this._anchorWorld(m.a, this._tmpA);

      if (m.kind === 'distance') {
        this._anchorWorld(m.b, this._tmpB);
        const d = this._tmpA.distanceTo(this._tmpB);
        m.value = d;
        const o = lineN * 6;
        lp[o] = this._tmpA.x;
        lp[o + 1] = this._tmpA.y;
        lp[o + 2] = this._tmpA.z;
        lp[o + 3] = this._tmpB.x;
        lp[o + 4] = this._tmpB.y;
        lp[o + 5] = this._tmpB.z;
        lineN++;
        // label at the midpoint
        this._proj.copy(this._tmpA).add(this._tmpB).multiplyScalar(0.5);
        m.label = formatLength(d);
        this._placeLabel(m, this._proj, W, H, `<b>${m.label}</b><em>${m.aName} → ${m.bName}</em>`);
      } else {
        const o = pointN * 3;
        pp[o] = this._tmpA.x;
        pp[o + 1] = this._tmpA.y;
        pp[o + 2] = this._tmpA.z;
        pointN++;

        const live = m.a.id ? this.props.live(m.a.id) : null;
        if (m.kind === 'tension') {
          const dev = live ? live.tensionVsRest : 0;
          m.value = dev;
          const txt = Math.abs(dev) < 0.02 ? 'at rest' : `${dev > 0 ? '+' : ''}${(dev * 100).toFixed(0)} %`;
          m.label = txt;
          this._placeLabel(
            m,
            this._tmpA,
            W,
            H,
            `<b>${txt}</b><em>${m.aName} · tension vs rest</em>` +
              (live && live.stiffening > 0.01 ? `<em>stiffened +${(live.stiffening * 100).toFixed(0)} %</em>` : '')
          );
        } else {
          const fid = live?.signalFidelity;
          const bw = live?.signalBandwidth;
          const lat = live?.signalLatencyMs;
          const hz = live?.firingHz;
          m.value = fid ?? 0;
          m.label = fid == null ? 'no endings' : `${(fid * 100).toFixed(0)} %`;
          this._placeLabel(
            m,
            this._tmpA,
            W,
            H,
            fid == null
              ? `<b>—</b><em>${m.aName} · no discrete endings</em>`
              : `<b>${(fid * 100).toFixed(0)} %</b><em>${m.aName} · fidelity</em>` +
                  `<em>bw ${(bw * 100).toFixed(0)} % · ${lat.toFixed(0)} ms · ${hz.toFixed(0)} Hz</em>`
          );
        }
      }
    }

    this._pos.needsUpdate = true;
    this._ppos.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, lineN * 2);
    this.points.geometry.setDrawRange(0, pointN);
  }

  _placeLabel(m, world, W, H, html) {
    this._proj.copy(world).project(this.camera);
    const behind = this._proj.z > 1 || this._proj.z < -1;
    const x = (this._proj.x * 0.5 + 0.5) * W;
    const y = (-this._proj.y * 0.5 + 0.5) * H;
    const el = m.el;
    if (behind || x < -80 || y < -40 || x > W + 80 || y > H + 40) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  }

  /* ============================================================
     Persistence
     ============================================================ */

  serialise() {
    return this.items.map((m) => ({
      id: m.id,
      kind: m.kind,
      aName: m.aName,
      bName: m.bName,
      a: { id: m.a.id, offset: m.a.offset.toArray(), node: m.a.node },
      b: m.b ? { id: m.b.id, offset: m.b.offset.toArray(), node: m.b.node } : null,
    }));
  }

  restore(list) {
    this.clear();
    for (const raw of list || []) {
      const item = this._make(raw.kind, {
        a: { id: raw.a.id, offset: new THREE.Vector3().fromArray(raw.a.offset), node: raw.a.node ?? -1 },
        b: raw.b ? { id: raw.b.id, offset: new THREE.Vector3().fromArray(raw.b.offset), node: raw.b.node ?? -1 } : undefined,
        aName: raw.aName,
        bName: raw.bName,
      });
      this._seq = Math.max(this._seq, parseInt(String(raw.id).slice(1), 10) || 0);
      void item;
    }
  }

  dispose() {
    this.clear();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

export const MEASURE_MODES = [
  { id: 'distance', name: 'Distance', hint: 'Click two points. The span follows the tissue as it moves.' },
  { id: 'tension', name: 'Tension', hint: 'Pin a probe to a structure and read its live deviation from rest.' },
  { id: 'signal', name: 'Signal', hint: 'Read the fidelity, bandwidth and latency arriving from a structure.' },
];
