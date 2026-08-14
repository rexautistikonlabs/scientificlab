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

import { signalMaterial, networkMaterial } from './materials.js';
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

    /* ---- particles ---- */
    const per = quality?.high ? 96 : 52;
    const count = per * P;
    const aT = new Float32Array(count);
    const aPath = new Float32Array(count);
    const aSeed = new Float32Array(count);
    const pos = new Float32Array(count * 3); // unused but required by three
    const r = rng(4242);
    for (let pi = 0; pi < P; pi++) {
      for (let k = 0; k < per; k++) {
        const i = pi * per + k;
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
  }

  setPixelRatio(v) {
    this.material.uniforms.uPixelRatio.value = v;
  }

  /** Beads grow modestly at deep tiers, where individual events are the subject. */
  setScale(scaleFloat) {
    this.material.uniforms.uSize.value = 4.0 + clamp(scaleFloat, 0, 4) * 0.85;
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
