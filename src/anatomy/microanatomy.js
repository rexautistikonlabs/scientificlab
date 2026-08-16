/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Receptor micro-anatomy.

   At the deepest scale tier the marker glyph is replaced by an
   actual model of the ending, built at physical size (100 µm –
   6 mm). Each one is drawn with the structure that gives it its
   frequency response, because that structure *is* the filter:
   the Pacinian corpuscle's lamellae are why it cannot see static
   load, and the spindle's capsule is why it reports velocity.
   ============================================================ */

import * as THREE from 'three';
import { loft, tube, spline, sample, merge, blob, place } from './build.js';
import { RECEPTORS } from './info.js';
import { lerp, TAU, rng } from '../core/util.js';
import { tissueMaterial, nerveMaterial } from '../gfx/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------
   Individual models. Each returns { group, parts:[{mesh, role}] }
   in local coordinates centred on the origin, sized in metres.
   ------------------------------------------------------------ */

function axonCurve(pts, r, seg = 6) {
  return tube(sample(spline(pts), 14), () => r, seg);
}

function pacinian(S) {
  // S ≈ 1.0e-3 m long axis
  const capsule = [];
  const LAM = 14;
  for (let k = 0; k < LAM; k++) {
    const f = 0.28 + (k / (LAM - 1)) * 0.72;
    const axis = [];
    const prof = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = (t - 0.5) * Math.PI;
      const y = Math.sin(ang) * S * 0.5 * f;
      const kk = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(Math.sin(ang)), 2.2)), 1 / 2.2);
      axis.push(V(0, y, 0));
      prof.push({ a: Math.max(1e-7, S * 0.3 * f * kk), b: Math.max(1e-7, S * 0.3 * f * kk), n: 2 });
    }
    capsule.push(loft(axis, prof, 20, { capStart: false, capEnd: false }));
  }
  const inner = axonCurve(
    [V(0, -S * 0.62, 0), V(0, -S * 0.3, 0), V(0, 0, 0), V(0, S * 0.28, 0), V(0, S * 0.34, 0)],
    S * 0.028
  );
  const stalk = axonCurve([V(0, -S * 0.5, 0), V(0, -S * 0.8, 0), V(0.0, -S * 1.15, S * 0.05)], S * 0.05);
  return { lamellae: merge(capsule), axon: merge([inner, stalk]) };
}

function meissner(S) {
  // stacked lamellar cells with the axon spiralling between them
  const discs = [];
  const N = 9;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const y = (t - 0.5) * S * 0.9;
    const r = S * 0.42 * Math.sin(lerp(0.28, 0.86, 1 - Math.abs(t - 0.5) * 2 + 0.5) * Math.PI);
    discs.push(
      place(blob(Math.max(1e-7, r), S * 0.045, Math.max(1e-7, r * 0.9), 10), { pos: [0, y, 0] })
    );
  }
  const spiral = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * TAU * 3.4;
    spiral.push(V(Math.cos(a) * S * 0.3, (t - 0.5) * S * 0.86, Math.sin(a) * S * 0.28));
  }
  const axon = merge([
    tube(spiral, () => S * 0.03, 5),
    axonCurve([V(0, -S * 0.46, 0), V(0, -S * 0.8, 0), V(0, -S * 1.2, 0)], S * 0.045),
  ]);
  return { lamellae: merge(discs), axon };
}

function ruffini(S) {
  // thin spindle capsule with collagen strands running through it and the
  // afferent branching between them
  const cap = [];
  const axis = [];
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const k = Math.sin(t * Math.PI);
    axis.push(V(0, (t - 0.5) * S, 0));
    prof.push({ a: Math.max(1e-7, S * 0.16 * k), b: Math.max(1e-7, S * 0.16 * k), n: 2 });
  }
  cap.push(loft(axis, prof, 16, { capStart: false, capEnd: false }));

  const strands = [];
  const r = rng(41);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const off = S * 0.07 * (0.4 + r());
    strands.push(
      tube(
        sample(
          spline([
            V(Math.cos(a) * off, -S * 0.72, Math.sin(a) * off),
            V(Math.cos(a) * off * 0.5, -S * 0.2, Math.sin(a) * off * 0.5),
            V(Math.cos(a + 0.4) * off * 0.5, S * 0.2, Math.sin(a + 0.4) * off * 0.5),
            V(Math.cos(a + 0.6) * off, S * 0.72, Math.sin(a + 0.6) * off),
          ])
        ,18),
        () => S * 0.014,
        4
      )
    );
  }

  const branches = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3;
    branches.push(
      axonCurve(
        [
          V(0, -S * 0.5, 0),
          V(Math.cos(a) * S * 0.04, -S * 0.2, Math.sin(a) * S * 0.04),
          V(Math.cos(a) * S * 0.1, S * 0.15, Math.sin(a) * S * 0.1),
          V(Math.cos(a) * S * 0.12, S * 0.42, Math.sin(a) * S * 0.12),
        ],
        S * 0.018,
        4
      )
    );
  }
  branches.push(axonCurve([V(0, -S * 0.5, 0), V(0, -S * 0.9, 0), V(0, -S * 1.3, 0)], S * 0.035));

  return { lamellae: merge(cap), collagen: merge(strands), axon: merge(branches) };
}

function freeEnding(S) {
  // an unencapsulated terminal tree
  const parts = [];
  const r = rng(77);
  const trunkPts = [V(0, -S * 1.6, 0), V(0, -S * 0.8, 0), V(0, -S * 0.2, 0)];
  parts.push(axonCurve(trunkPts, S * 0.06, 5));
  const grow = (from, dir, len, rad, depth) => {
    const to = from.clone().addScaledVector(dir, len);
    parts.push(axonCurve([from, from.clone().addScaledVector(dir, len * 0.5), to], rad, 4));
    if (depth <= 0) return;
    for (let k = 0; k < 2; k++) {
      const d = dir
        .clone()
        .add(V((r() - 0.5) * 1.5, (r() - 0.5) * 0.8 + 0.3, (r() - 0.5) * 1.5))
        .normalize();
      grow(to, d, len * 0.66, rad * 0.7, depth - 1);
    }
  };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    grow(V(0, -S * 0.2, 0), V(Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5).normalize(), S * 0.7, S * 0.045, 2);
  }
  return { axon: merge(parts) };
}

function spindleModel(S) {
  // S ≈ 6e-3 m. Fusiform capsule, intrafusal fibres, annulospiral Ia ending
  const capAxis = [];
  const capProf = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const k = Math.pow(Math.sin(t * Math.PI), 0.75);
    capAxis.push(V(0, (t - 0.5) * S, 0));
    capProf.push({ a: Math.max(1e-7, S * 0.1 * k), b: Math.max(1e-7, S * 0.1 * k), n: 2 });
  }
  const capsule = loft(capAxis, capProf, 18, { capStart: false, capEnd: false });

  const fibres = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const off = S * 0.035;
    const bag = k < 2;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const swell = bag ? 1 + 0.9 * Math.exp(-Math.pow((t - 0.5) / 0.16, 2)) : 1;
      pts.push(V(Math.cos(a) * off * swell, (t - 0.5) * S * 1.06, Math.sin(a) * off * swell));
    }
    fibres.push(tube(pts, (t) => S * 0.016 * (bag ? 1 + 0.8 * Math.exp(-Math.pow((t - 0.5) / 0.16, 2)) : 1), 6));
  }

  // annulospiral wrapping at the equator — the primary (Ia) ending
  const spiral = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const a = t * TAU * 5.5;
    const y = (t - 0.5) * S * 0.28;
    const rr = S * 0.052;
    spiral.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr));
  }
  const afferent = merge([
    tube(spiral, () => S * 0.011, 5),
    axonCurve([V(S * 0.05, 0, 0), V(S * 0.14, S * 0.06, 0), V(S * 0.26, S * 0.14, 0)], S * 0.018, 5),
  ]);

  return { lamellae: capsule, collagen: merge(fibres), axon: afferent };
}

function golgiModel(S) {
  // braided collagen bundles with the Ib afferent weaving between them
  const bundles = [];
  const r = rng(303);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const off = S * 0.13 * (0.5 + r() * 0.6);
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const twist = a + t * 1.5;
      const squeeze = 0.5 + 0.5 * Math.abs(Math.cos(t * Math.PI));
      pts.push(V(Math.cos(twist) * off * squeeze, (t - 0.5) * S, Math.sin(twist) * off * squeeze));
    }
    bundles.push(tube(pts, () => S * 0.02, 5));
  }
  const weave = [];
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const a = k * 1.6 + t * TAU * 1.6;
      const rr = S * 0.09 * (0.6 + 0.4 * Math.sin(t * Math.PI * 3));
      pts.push(V(Math.cos(a) * rr, (t - 0.5) * S * 0.7, Math.sin(a) * rr));
    }
    weave.push(tube(pts, () => S * 0.012, 4));
  }
  weave.push(axonCurve([V(0, -S * 0.36, 0), V(S * 0.06, -S * 0.7, 0), V(S * 0.16, -S * 1.0, 0)], S * 0.02, 5));
  const capsule = (() => {
    const axis = [];
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const k = Math.pow(Math.sin(t * Math.PI), 0.6);
      axis.push(V(0, (t - 0.5) * S * 1.04, 0));
      prof.push({ a: Math.max(1e-7, S * 0.19 * k), b: Math.max(1e-7, S * 0.19 * k), n: 2 });
    }
    return loft(axis, prof, 16, { capStart: false, capEnd: false });
  })();
  return { lamellae: capsule, collagen: merge(bundles), axon: merge(weave) };
}

function interoModel(S) {
  // varicose terminal running across a serosal membrane
  const membrane = new THREE.PlaneGeometry(S * 6, S * 6, 6, 6);
  membrane.rotateX(-Math.PI / 2);
  const parts = [];
  const r = rng(555);
  for (let k = 0; k < 3; k++) {
    const pts = [];
    const base = (k - 1) * S * 0.9;
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      pts.push(V(lerp(-S * 2.4, S * 2.4, t), Math.sin(t * 9 + k) * S * 0.12, base + Math.sin(t * 5 + k * 2) * S * 0.5));
    }
    parts.push(tube(pts, (t) => S * 0.05 * (1 + 0.8 * Math.sin(t * 26 + k)), 5));
    // varicosities
    for (let v = 0; v < 5; v++) {
      const t = 0.1 + v * 0.2 + r() * 0.05;
      const i = Math.min(22, Math.floor(t * 22));
      parts.push(place(blob(S * 0.11, S * 0.09, S * 0.11, 7), { pos: [pts[i].x, pts[i].y, pts[i].z] }));
    }
  }
  return { collagen: membrane, axon: merge(parts) };
}

const BUILDERS = {
  pacinian,
  meissner,
  ruffini,
  free: freeEnding,
  spindle: spindleModel,
  golgi: golgiModel,
  intero: interoModel,
};

/* ------------------------------------------------------------
   Assembly
   ------------------------------------------------------------ */

/**
 * Build all seven micro models into one group. Only the active class is
 * ever visible, and the group is repositioned onto whatever the camera
 * has descended toward.
 */
export function buildMicroAnatomy() {
  const root = new THREE.Group();
  root.name = 'microAnatomy';
  root.visible = false;
  const models = new Map();

  for (const id of Object.keys(BUILDERS)) {
    const def = RECEPTORS[id];
    const S = Math.max(def.size, 1.4e-4);
    const built = BUILDERS[id](S);
    const g = new THREE.Group();
    g.visible = false;

    const mats = [];
    if (built.lamellae) {
      const m = tissueMaterial({
        color: new THREE.Color(def.color).getHex(),
        opacity: 0.3,
        rough: 0.4,
        spec: 0.5,
        rim: 1.5,
        mode: 'xray',
        doubleSide: true,
        disp: 0,
      });
      const mesh = new THREE.Mesh(stripBind(built.lamellae), m);
      mesh.renderOrder = 3;
      g.add(mesh);
      mats.push(m);
    }
    if (built.collagen) {
      const m = tissueMaterial({
        color: 0xdfe9f2,
        opacity: 0.42,
        rough: 0.55,
        spec: 0.4,
        rim: 1.0,
        mode: 'xray',
        doubleSide: true,
        stripe: 0.5,
        stripeFreq: 60,
        disp: 0,
      });
      const mesh = new THREE.Mesh(stripBind(built.collagen), m);
      mesh.renderOrder = 2;
      g.add(mesh);
      mats.push(m);
    }
    if (built.axon) {
      const m = nerveMaterial({ color: 0xffd166, opacity: 1, rate: 4, speed: 1.6 });
      m.uniforms.uLocalDisp.value = 0;
      const mesh = new THREE.Mesh(stripBind(built.axon), m);
      mesh.renderOrder = 4;
      g.add(mesh);
      mats.push(m);
    }

    root.add(g);
    models.set(id, { id, def, group: g, materials: mats, size: S });
  }

  return { root, models };
}

/** Micro models are not part of the network solve, so give them neutral bindings. */
function stripBind(geom) {
  const n = geom.getAttribute('position').count;
  const zeros = new Float32Array(n);
  geom.setAttribute('aNodeA', new THREE.BufferAttribute(zeros, 1));
  geom.setAttribute('aNodeB', new THREE.BufferAttribute(zeros.slice(), 1));
  geom.setAttribute('aNodeW', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  if (!geom.getAttribute('uv')) {
    const uv = new Float32Array(n * 2);
    const pos = geom.getAttribute('position');
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const h = Math.max(1e-9, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      uv[i * 2] = 0.5;
      uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return geom;
}
