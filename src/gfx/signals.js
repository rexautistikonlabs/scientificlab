/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Afferent signal streams and the network overlay.

   Signal traffic is drawn as particles travelling *proximally* along
   baked afferent routes. Every route is a row of a float texture, so
   the whole system is one draw call regardless of how many pathways
   are active.

   The particles are not decoration: their spacing encodes firing
   rate, their brightness encodes amplitude, their sharpness encodes
   fidelity and their speed encodes conduction velocity. Restrict a
   region and the change is legible in the stream itself.
   ============================================================ */

import * as THREE from 'three';
import { spline, sample } from '../anatomy/build.js';
import { nerveTrunks } from '../anatomy/neuro.js';
import { VERTEBRAE } from '../anatomy/landmarks.js';
import { clamp, rng } from '../core/util.js';

import { signalMaterial, networkMaterial, microPulseMaterial } from './materials.js';
import { STRUT } from '../sim/tensegrity.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SAMPLES = 64;

/**
 * Cord centre-line from a given height up to the brainstem, ordered
 * caudal → cranial: particles travel toward the end of the array, and
 * afferent traffic ascends.
 */
function cordFrom(y0) {
  const pts = VERTEBRAE.filter((v) => v.pos.y >= y0 - 0.001 && v.region !== 'S')
    .slice()
    .sort((a, b) => a.pos.y - b.pos.y)
    .map((v) => V(0, v.pos.y, v.pos.z - 0.006));
  pts.push(V(0, 1.6, -0.012), V(0, 1.645, -0.002), V(0, 1.668, 0.006));
  return pts;
}

/**
 * Afferent routes: distal receptor field → peripheral trunk → root →
 * cord → brainstem. Order matters: particles travel toward index 1.
 */
function buildRoutes() {
  const trunks = nerveTrunks();
  const byId = (id) => trunks.find((t) => t.id === id);
  const routes = [];

  const add = (id, name, pathway, pts, source) => {
    if (pts.length < 2) return;
    routes.push({ id, name, pathway, points: pts, source });
  };

  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const lr = s > 0 ? 'left' : 'right';

    // lower limb: plantar surface → tibial → sciatic → lumbosacral cord
    add(
      `leg:${tag}`,
      `Plantar & posterior ${lr} limb`,
      'dorsalColumn',
      [...byId('tibial').path(s)].reverse().concat([...byId('sciatic').path(s)].reverse().slice(1), cordFrom(0.99)),
      'lowerLimb'
    );

    // anterior limb: dorsal foot → peroneal → femoral → lumbar cord
    add(
      `legAnt:${tag}`,
      `Anterior ${lr} limb`,
      'spinocerebellar',
      [...byId('peroneal').path(s)].reverse().concat([...byId('femoral').path(s)].reverse().slice(1), cordFrom(1.06)),
      'lowerLimb'
    );

    // hand → median → plexus → cervical cord
    add(
      `armMedian:${tag}`,
      `${lr.charAt(0).toUpperCase() + lr.slice(1)} hand — median`,
      'dorsalColumn',
      [...byId('median').path(s)].reverse().concat([...byId('brachialPlexus').path(s)].reverse().slice(1), cordFrom(1.44)),
      'upperLimb'
    );

    // hand → ulnar
    add(
      `armUlnar:${tag}`,
      `${lr.charAt(0).toUpperCase() + lr.slice(1)} hand — ulnar`,
      'dorsalColumn',
      [...byId('ulnar').path(s)].reverse().concat([...byId('brachialPlexus').path(s)].reverse().slice(1), cordFrom(1.44)),
      'upperLimb'
    );

    // viscera → vagus → brainstem
    add(
      `vagal:${tag}`,
      `Visceral afferents · ${lr} vagus`,
      'vagal',
      [...byId('vagus').path(s)].reverse().concat([V(s * 0.02, 1.63, -0.016), V(0, 1.66, 0.004)]),
      'visceral'
    );

    // diaphragm → phrenic → cervical cord
    add(
      `phrenic:${tag}`,
      `Diaphragm · ${lr} phrenic`,
      'dorsalColumn',
      [...byId('phrenic').path(s)].reverse().concat(cordFrom(1.48)),
      'thoracic'
    );

    // thoracic wall → intercostal → thoracic cord
    add(
      `intercostal:${tag}`,
      `Thoracic wall · ${lr} intercostal`,
      'dorsalColumn',
      [
        V(s * 0.018, 1.24, 0.062),
        V(s * 0.06, 1.25, 0.056),
        V(s * 0.11, 1.27, 0.02),
        V(s * 0.06, 1.294, -0.02),
        V(s * 0.026, 1.3, -0.03),
        ...cordFrom(1.3),
      ],
      'thoracic'
    );

    // abdominal viscera → sympathetic chain → thoracolumbar cord
    add(
      `splanchnic:${tag}`,
      `Abdominal viscera · ${lr} splanchnic`,
      'sympathetic',
      [
        V(s * 0.02, 1.05, 0.02),
        V(s * 0.02, 1.1, -0.006),
        V(s * 0.017, 1.16, -0.024),
        V(s * 0.017, 1.24, -0.026),
        ...cordFrom(1.26),
      ],
      'visceral'
    );

    // thoracolumbar fascia → segmental roots → cord
    add(
      `tlf:${tag}`,
      `Thoracolumbar fascia · ${lr}`,
      'anterolateral',
      [
        V(s * 0.1, 1.02, -0.07),
        V(s * 0.06, 1.06, -0.062),
        V(s * 0.03, 1.1, -0.05),
        V(s * 0.014, 1.13, -0.04),
        ...cordFrom(1.14),
      ],
      'lumbar'
    );

    // deep cervical → segmental → brainstem
    add(
      `cervical:${tag}`,
      `Deep cervical fascia · ${lr}`,
      'dorsalColumn',
      [
        V(s * 0.05, 1.5, 0.014),
        V(s * 0.036, 1.52, -0.006),
        V(s * 0.02, 1.545, -0.02),
        ...cordFrom(1.55),
      ],
      'cervical'
    );
  }

  return routes;
}

export class SignalStreams {
  constructor(afferent, quality) {
    this.afferent = afferent;
    this.routes = buildRoutes();
    const P = this.routes.length;

    /* ---- bake route geometry into a float texture ---- */
    const data = new Float32Array(SAMPLES * P * 4);
    this.routeLengths = new Float32Array(P);
    this.routes.forEach((r, pi) => {
      const curve = spline(r.points, 0.5);
      const pts = sample(curve, SAMPLES - 1);
      this.routeLengths[pi] = curve.getLength();
      for (let i = 0; i < SAMPLES; i++) {
        const o = (pi * SAMPLES + i) * 4;
        const p = pts[i];
        data[o] = p.x;
        data[o + 1] = p.y;
        data[o + 2] = p.z;
        data[o + 3] = 1;
      }
    });
    this.pathTex = new THREE.DataTexture(data, SAMPLES, P, THREE.RGBAFormat, THREE.FloatType);
    this.pathTex.minFilter = this.pathTex.magFilter = THREE.NearestFilter;
    this.pathTex.needsUpdate = true;

    /* ---- per-route live state ---- */
    this.stateData = new Float32Array(P * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, P, 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.minFilter = this.stateTex.magFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;

    /* ---- particles ----
       Interleaved by position-along-path rather than grouped by path: index
       `k * P + pi` means the first n·P vertices are n evenly spaced beads on
       *every* pathway, so the quality tier can subsample the field with a single
       draw-range change and still show all twenty routes. Grouping by path would
       have made a reduced draw range silently drop whole pathways. */
    const per = 96;
    this.perPath = per;
    this.pathCount = P;
    const count = per * P;
    const aT = new Float32Array(count);
    const aPath = new Float32Array(count);
    const aSeed = new Float32Array(count);
    const pos = new Float32Array(count * 3); // unused but required by three
    const r = rng(4242);
    for (let k = 0; k < per; k++) {
      for (let pi = 0; pi < P; pi++) {
        const i = k * P + pi;
        aT[i] = k / per;
        aPath[i] = pi;
        aSeed[i] = r();
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geom.setAttribute('aPath', new THREE.BufferAttribute(aPath, 1));
    geom.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);

    this.material = signalMaterial();
    this.material.uniforms.tPaths.value = this.pathTex;
    this.material.uniforms.tPathState.value = this.stateTex;
    this.material.uniforms.uPathRes.value.set(SAMPLES, P);

    this.points = new THREE.Points(geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'afferentSignals';

    this.density = 1;
    this.sizeFactor = 1;
    this._scaleFloat = 0;
    this.setDensity(quality?.high === false ? 0.55 : 1);
  }

  setPixelRatio(v) {
    this.material.uniforms.uPixelRatio.value = v;
  }

  /**
   * Fraction of the particle field to draw, 0..1. Additive sprites are pure
   * fill cost, so this is one of the cheapest levers the quality tier has; the
   * stream stays legible well below half density because spacing, not count,
   * is what encodes firing rate.
   */
  setDensity(frac) {
    this.density = clamp(frac, 0.08, 1);
    const n = Math.max(6, Math.round(this.perPath * this.density));
    this.drawn = n * this.pathCount;
    this.points.geometry.setDrawRange(0, this.drawn);
  }

  /** Bead size multiplier from the quality tier. */
  setSizeFactor(f) {
    this.sizeFactor = f;
    this.setScale(this._scaleFloat);
  }

  /** Beads grow modestly at deep tiers, where individual events are the subject. */
  setScale(scaleFloat) {
    this._scaleFloat = scaleFloat;
    this.material.uniforms.uSize.value = (4.0 + clamp(scaleFloat, 0, 4) * 0.85) * this.sizeFactor;
  }

  update(store) {
    const on = store.renderEnabled('signals');
    this.points.visible = on && store.effectiveOpacity('nerve') > 0.004;
    if (!this.points.visible) return;
    this.material.uniforms.uOpacity.value = clamp(store.effectiveOpacity('nerve') * 1.15, 0, 1);

    const d = this.stateData;
    this.routes.forEach((r, i) => {
      const pw = this.afferent.pathways.get(r.pathway);
      const o = i * 4;
      // pulses per unit path length: higher rate → tighter spacing
      d[o] = clamp(1.5 + (pw ? pw.rate : 0) * 0.28, 1, 26);
      d[o + 1] = clamp(pw ? pw.fidelity : 1, 0.06, 1.1);
      d[o + 2] = clamp((pw ? pw.latency : 0) / 260, 0, 1);
      d[o + 3] = clamp(pw ? 0.2 + pw.amp * 1.15 : 0.4, 0, 1.4);
    });
    this.stateTex.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.pathTex.dispose();
    this.stateTex.dispose();
  }
}

/* ============================================================
   Tension network overlay
   ============================================================ */

export class NetworkOverlay {
  constructor(solver) {
    this.solver = solver;
    const m = solver.elemCount;
    this.positions = new Float32Array(m * 6);
    const tension = new Float32Array(m * 2);
    const kind = new Float32Array(m * 2);
    for (let e = 0; e < m; e++) {
      const k = solver.ekind[e] === STRUT ? 1 : 0;
      kind[e * 2] = k;
      kind[e * 2 + 1] = k;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.tensionAttr = new THREE.BufferAttribute(tension, 1);
    geom.setAttribute('aTension', this.tensionAttr);
    geom.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
    this.posAttr = geom.getAttribute('position');

    this.material = networkMaterial();
    this.lines = new THREE.LineSegments(geom, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 18;
    this.lines.name = 'tensionNetwork';

    // nodes as points
    const np = new Float32Array(solver.count * 3);
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(np, 3));
    ng.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
    this.nodePos = ng.getAttribute('position');
    this.nodes = new THREE.Points(
      ng,
      new THREE.PointsMaterial({
        size: 2.6,
        sizeAttenuation: false,
        color: 0xbcd6e6,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    this.nodes.frustumCulled = false;
    this.nodes.renderOrder = 19;

    this.group = new THREE.Group();
    this.group.add(this.lines, this.nodes);
    this.group.visible = false;
  }

  update(store) {
    const vis = store.effectiveOpacity('network') > 0.004;
    this.group.visible = vis;
    if (!vis) return;
    const s = this.solver;
    s.writeLinePositions(this.positions);
    this.posAttr.needsUpdate = true;
    const t = this.tensionAttr.array;
    for (let e = 0; e < s.elemCount; e++) {
      const v = Math.min(1.4, s.etenSm[e] / Math.max(0.02, s._loadNorm * 0.5));
      t[e * 2] = v;
      t[e * 2 + 1] = v;
    }
    this.tensionAttr.needsUpdate = true;
    const np = this.nodePos.array;
    for (let i = 0; i < s.count * 3; i++) np[i] = s.pos[i];
    this.nodePos.needsUpdate = true;
    this.material.uniforms.uOpacity.value = store.effectiveOpacity('network');
    this.nodes.material.opacity = store.effectiveOpacity('network') * 1.4;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
    this.nodes.geometry.dispose();
    this.nodes.material.dispose();
  }
}

/* ============================================================
   Micro-mode afferent pulses

   One action potential per drawn dot, positioned by how long ago the spike
   generator emitted it as a fraction of its conduction delay. Nothing here has a
   phase or a frequency of its own: if the spindle model emits no spikes the axon
   is silent, and if the conduction velocity changes the dots visibly arrive
   sooner or later. That is the whole point of drawing them separately from the
   whole-body streams, which are a *rate* visualisation and quite deliberately
   not spike-locked.
   ============================================================ */

/** Hard ceiling on drawn pulses. Timing never depends on this — only how many are shown. */
const MAX_MICRO_PULSES = 32;

export class MicroPulses {
  /**
   * @param {THREE.Vector3[]} path  axon centre-line, ending → central, in the
   *                                micro group's local frame
   */
  constructor(path) {
    this.curve = spline(path, 0.5);
    this.material = microPulseMaterial();

    const pos = new Float32Array(MAX_MICRO_PULSES * 3);
    const age = new Float32Array(MAX_MICRO_PULSES);
    const geom = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.ageAttr = new THREE.BufferAttribute(age, 1);
    geom.setAttribute('position', this.posAttr);
    geom.setAttribute('aAge', this.ageAttr);
    // the group is repositioned every frame, so a fixed bound would be wrong
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    geom.setDrawRange(0, 0);

    this.points = new THREE.Points(geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
    this.points.name = 'microAfferentPulses';
    this.points.visible = false;

    /** the axon itself, so the pulses have something to travel along */
    this.axon = null;
    this._u = new Float32Array(MAX_MICRO_PULSES);
    this._p = new THREE.Vector3();
    this.drawn = 0;
    this.density = 1;
  }

  setPixelRatio(v) {
    this.material.uniforms.uPixelRatio.value = v;
  }

  /**
   * Quality lever. Reduces how many in-flight spikes are *drawn*; the spike
   * generator and the conduction delay are untouched, so a low-end machine shows
   * a sparser axon with identical timing.
   */
  setDensity(frac) {
    this.density = clamp(frac, 0.15, 1);
  }

  /**
   * @param {import('../sim/spindle.js').SpindleUnit} spindle
   * @param {boolean} visible
   */
  update(spindle, visible) {
    this.points.visible = !!visible && !!spindle?.resolved;
    if (!this.points.visible) {
      this.drawn = 0;
      this.points.geometry.setDrawRange(0, 0);
      return;
    }
    const limit = Math.max(2, Math.round(MAX_MICRO_PULSES * this.density));
    const n = spindle.inFlight(this._u, limit);
    const pos = this.posAttr.array;
    const age = this.ageAttr.array;
    for (let i = 0; i < n; i++) {
      const u = this._u[i];
      this.curve.getPoint(clamp(u, 0, 1), this._p);
      pos[i * 3] = this._p.x;
      pos[i * 3 + 1] = this._p.y;
      pos[i * 3 + 2] = this._p.z;
      age[i] = u;
    }
    this.drawn = n;
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
