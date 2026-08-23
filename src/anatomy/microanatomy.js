/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
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
import { crowdMesh, randQuat, alignedQuat, pick } from './cellscape.js';

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
   Tissue context beds.

   A receptor drawn alone in a black field is a diagram, not anatomy: every one
   of these endings is defined by the tissue it is embedded in. Each context is
   the *minimum* surrounding that makes the ending's situation legible — the
   extrafusal fascicles a spindle lies in parallel with, the epidermal ridges a
   Meissner corpuscle pushes into, the tendon a Golgi organ is woven through.
   Everything is procedural, merged into a handful of draw calls, and fades in
   with the same blend as the subject. Context is presentation only: nothing
   here is bound to the solver, nothing is pickable, and nothing carries an ID —
   it is the stage, not an actor.
   ------------------------------------------------------------ */

/** A wavy tissue fibre running along Y. */
function contextFibre(S, r, { rad, ang, len, radius, wave = 0.02, y0 = 0 }) {
  const pts = [];
  const n = 8;
  const phase = r() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + (t - 0.5) * len;
    pts.push(
      V(
        Math.cos(ang) * rad + Math.sin(t * 3.1 + phase) * S * wave,
        y,
        Math.sin(ang) * rad + Math.cos(t * 2.6 + phase) * S * wave
      )
    );
  }
  return tube(pts, () => radius, 6);
}

/** An undulating epidermal roof with ridge rows, for the cutaneous classes. */
function epidermisSheet(S, { w, y, amp, ridges = 7 }) {
  const half = w / 2;
  const geo = sheetGrid(18, 18, (u, v, out) => {
    const x = (u - 0.5) * w;
    const z = (v - 0.5) * w;
    const ridge = Math.sin(u * Math.PI * ridges) * Math.cos(v * Math.PI * 2.2) * amp;
    const sag = -Math.pow((x * x + z * z) / (half * half), 1.5) * amp * 0.6;
    out.set(x, y + ridge + sag, z);
  });
  return geo;
}

/** Minimal parametric grid — local so this module owns its own context shapes. */
function sheetGrid(nu, nv, fn) {
  const verts = [];
  const uvs = [];
  const idx = [];
  const out = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      fn(i / nu, j / nv, out);
      verts.push(out.x, out.y, out.z);
      uvs.push(i / nu, j / nv);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const MUSCLE_BED = { color: 0xa63a44, opacity: 0.46, rough: 0.5, spec: 0.3, rim: 0.8, mode: 'xray', xrayFloor: 0.14, doubleSide: true, stripe: 0.7, stripeFreq: 30, sss: 0.3 };
const COLLAGEN_BED = { color: 0xd9cfae, opacity: 0.44, rough: 0.6, spec: 0.28, rim: 0.9, mode: 'xray', xrayFloor: 0.12, doubleSide: true, stripe: 0.55, stripeFreq: 22, sss: 0.35 };
const DERMIS_BED = { color: 0xe0b090, opacity: 0.22, rough: 0.85, spec: 0.12, rim: 0.9, mode: 'xray', xrayFloor: 0.07, doubleSide: true, sss: 0.55 };

/* ------------------------------------------------------------
   Instanced tissue crowds — the density layer.

   The merged wisps and fibres give each bed its structure; what they cannot
   give it is *packing*. Every bed therefore carries instanced fibril and
   ground-substance populations built with the same crowd system as the
   cellular tier: collagen fibrils as aligned rods running with the tissue's
   grain, ground substance and cell bodies as small muted specks. One or two
   draw calls per bed, only one bed visible at a time, counts scaled by the
   quality tier, seethe and congestion driven by the same solved local state
   as the cell. Illustrative composition, like everything at this depth.
   ------------------------------------------------------------ */

const ICO_BASE = new THREE.IcosahedronGeometry(1, 0);
const ROD_BASE = new THREE.CylinderGeometry(0.3, 0.3, 3.2, 5, 1, false);

const FIBRIL_PAL = [
  { c: 0xd9cfae, w: 0.45 },
  { c: 0xcabf9e, w: 0.3 },
  { c: 0xe6dcc2, w: 0.25 },
];
const GROUND_PAL = [
  { c: 0x9fb2c2, w: 0.45 },
  { c: 0xcfc4b2, w: 0.35 },
  { c: 0x8fa89e, w: 0.2 },
];
const SARCO_PAL = [
  { c: 0xa85850, w: 0.4 },
  { c: 0x8a4a44, w: 0.35 },
  { c: 0xc47a6a, w: 0.25 },
];

/** Aligned fibril rods filling a volume. dirFn(r) gives the local grain. */
function fibrilCrowd(r, n, S, { sMin, sMax, posFn, dirFn, pal = FIBRIL_PAL, jitter = 0.22 }) {
  const items = [];
  for (let k = 0; k < n; k++) {
    items.push({
      p: posFn(r),
      s: S * (sMin + (sMax - sMin) * r()),
      c: pick(pal, r),
      q: alignedQuat(dirFn(r), r, jitter),
    });
  }
  return { crowd: { base: ROD_BASE, items } };
}

/** Ground-substance / cell-body specks filling a volume. */
function speckCrowd(r, n, S, { sMin, sMax, posFn, pal = GROUND_PAL }) {
  const items = [];
  for (let k = 0; k < n; k++) {
    items.push({
      p: posFn(r),
      s: S * (sMin + (sMax - sMin) * r()),
      c: pick(pal, r),
      q: randQuat(r),
    });
  }
  return { crowd: { base: ICO_BASE, items } };
}

/** Point in an annulus around the Y axis. */
const annulusPt = (S, r0, r1, h) => (r) => {
  const a = r() * TAU;
  const rad = S * (r0 + (r1 - r0) * Math.sqrt(r()));
  return V(Math.cos(a) * rad, (r() - 0.5) * S * h, Math.sin(a) * rad);
};
/** Point in a box slab. */
const slabPt = (S, w, h, d, cy = 0) => (r) =>
  V((r() - 0.5) * S * w, S * cy + (r() - 0.5) * S * h, (r() - 0.5) * S * d);

const CONTEXTS = {
  /* The spindle lies in parallel with the extrafusal fascicles — that parallel
     arrangement is the entire mechanical premise of the receptor, so the bed
     around it *is* the lesson. The fibres share the group's live axial stretch. */
  spindle(S) {
    const r = rng(1211);
    const fibres = [];
    for (let k = 0; k < 54; k++) {
      const rad = S * (0.16 + 0.72 * Math.pow(r(), 0.7));
      fibres.push(
        contextFibre(S, r, {
          rad,
          ang: r() * TAU,
          len: S * (1.5 + 0.7 * r()),
          radius: S * (0.02 + 0.022 * r()),
          y0: (r() - 0.5) * S * 0.3,
        })
      );
    }
    const sheathAxis = [];
    const sheathProf = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const k = 0.72 + 0.28 * Math.sin(t * Math.PI);
      sheathAxis.push(V(0, (t - 0.5) * S * 2.1, 0));
      sheathProf.push({ a: S * 0.92 * k, b: S * 0.92 * k, n: 2 });
    }
    return [
      { geom: merge(fibres), opts: MUSCLE_BED },
      {
        geom: loft(sheathAxis, sheathProf, 18, { capStart: false, capEnd: false }),
        opts: { color: 0xd8e8ee, opacity: 0.07, rough: 0.7, spec: 0.15, rim: 0.7, mode: 'xray', xrayFloor: 0.04, doubleSide: true },
        order: 0,
      },
      // endomysial collagen running with the fibres, and the sarcoplasmic /
      // interstitial grain between them — the packing layer
      fibrilCrowd(r, 900, S, { sMin: 0.012, sMax: 0.03, posFn: annulusPt(S, 0.14, 0.95, 2.1), dirFn: () => V(0, 1, 0), jitter: 0.12 }),
      speckCrowd(r, 1500, S, { sMin: 0.006, sMax: 0.016, posFn: annulusPt(S, 0.14, 0.9, 2.0), pal: SARCO_PAL }),
    ];
  },

  /* The Golgi organ sits at the muscle–tendon junction: muscle red arriving
     from one pole, tendon cream leaving the other. */
  golgi(S) {
    const r = rng(407);
    const tendon = [];
    const muscle = [];
    for (let k = 0; k < 26; k++) {
      const ang = r() * TAU;
      const rad = S * (0.08 + 0.3 * r());
      const splay = 1 + r() * 0.7;
      tendon.push(
        contextFibre(S, r, { rad: rad * splay, ang, len: S * 2.2, radius: S * (0.02 + 0.014 * r()), y0: -S * 1.35, wave: 0.008 })
      );
      muscle.push(
        contextFibre(S, r, { rad: rad * splay, ang, len: S * 2.0, radius: S * (0.028 + 0.02 * r()), y0: S * 1.3, wave: 0.02 })
      );
    }
    return [
      { geom: merge(tendon), opts: COLLAGEN_BED },
      { geom: merge(muscle), opts: MUSCLE_BED },
      // the dense parallel fibril field a tendon actually is — tightly aligned
      fibrilCrowd(r, 1600, S, { sMin: 0.014, sMax: 0.034, posFn: annulusPt(S, 0, 0.6, 3.4), dirFn: () => V(0, 1, 0), jitter: 0.07 }),
      speckCrowd(r, 500, S, { sMin: 0.008, sMax: 0.018, posFn: annulusPt(S, 0, 0.55, 3.0) }),
    ];
  },

  /* Deep subcutis: fat lobules and crossing collagen septa, with the dermal
     floor far overhead — a Pacinian corpuscle lives deep, and the empty
     distance to the surface is part of what it is. */
  pacinian(S) {
    const r = rng(902);
    const lobules = [];
    for (let k = 0; k < 9; k++) {
      const b = blob(S * (0.4 + 0.3 * r()), S * (0.3 + 0.2 * r()), S * (0.4 + 0.3 * r()), 8);
      place(b, { pos: [(r() - 0.5) * S * 3.4, -S * 0.4 - r() * S * 1.6, (r() - 0.5) * S * 3.4] });
      lobules.push(b);
    }
    const septa = [];
    for (let k = 0; k < 14; k++) {
      septa.push(
        contextFibre(S, r, { rad: S * (0.5 + 1.1 * r()), ang: r() * TAU, len: S * 3.4, radius: S * 0.028, wave: 0.06 })
      );
    }
    return [
      { geom: merge(lobules), opts: { color: 0xe8cf9e, opacity: 0.1, rough: 0.9, spec: 0.08, rim: 0.8, mode: 'xray', xrayFloor: 0.05, doubleSide: true, sss: 0.5 } },
      { geom: merge(septa), opts: COLLAGEN_BED },
      { geom: epidermisSheet(S, { w: S * 6.4, y: S * 2.4, amp: S * 0.12, ridges: 8 }), opts: DERMIS_BED, order: 0 },
      // subcutis: loose multidirectional fibrils and adipose/ground grain
      fibrilCrowd(r, 1100, S, { sMin: 0.02, sMax: 0.05, posFn: slabPt(S, 5.6, 3.4, 5.6, -0.4), dirFn: (rr) => V(rr() * 2 - 1, (rr() - 0.5) * 0.8, rr() * 2 - 1), jitter: 0.35 }),
      speckCrowd(r, 700, S, { sMin: 0.014, sMax: 0.034, posFn: slabPt(S, 5.2, 3.2, 5.2, -0.5), pal: [{ c: 0xe8cf9e, w: 0.55 }, { c: 0xcfc4b2, w: 0.25 }, { c: 0x9fb2c2, w: 0.2 }] }),
    ];
  },

  /* A Meissner corpuscle sits inside a dermal papilla, pressed up against the
     ridged underside of the epidermis — the roof is nearly touching. */
  meissner(S) {
    const r = rng(311);
    const wisps = [];
    for (let k = 0; k < 18; k++) {
      wisps.push(
        contextFibre(S, r, { rad: S * (0.45 + 0.8 * r()), ang: r() * TAU, len: S * 1.9, radius: S * 0.02, wave: 0.08, y0: -S * 0.4 })
      );
    }
    return [
      { geom: epidermisSheet(S, { w: S * 4.6, y: S * 0.72, amp: S * 0.22, ridges: 6 }), opts: { ...DERMIS_BED, opacity: 0.2 }, order: 0 },
      { geom: merge(wisps), opts: COLLAGEN_BED },
      // papillary dermis: fine fibrils weaving beneath the ridges
      fibrilCrowd(r, 900, S, { sMin: 0.012, sMax: 0.03, posFn: slabPt(S, 4.2, 1.7, 4.2, -0.45), dirFn: (rr) => V(rr() * 2 - 1, (rr() - 0.5) * 0.5, rr() * 2 - 1), jitter: 0.3 }),
      speckCrowd(r, 500, S, { sMin: 0.008, sMax: 0.02, posFn: slabPt(S, 4.0, 1.6, 4.0, -0.5) }),
    ];
  },

  /* Ruffini endings anchor to the collagen field around them: the external
     wisps continue the internal strands, so stretch has somewhere to come from. */
  ruffini(S) {
    const r = rng(555);
    const wisps = [];
    for (let k = 0; k < 24; k++) {
      const g = contextFibre(S, r, { rad: S * (0.2 + 0.5 * r()), ang: r() * TAU, len: S * 2.6, radius: S * 0.018, wave: 0.03 });
      // the capsule's long axis is Y; keep the field loosely aligned with it
      place(g, { rot: [0, 0, (r() - 0.5) * 0.5] });
      wisps.push(g);
    }
    return [
      { geom: merge(wisps), opts: COLLAGEN_BED },
      { geom: epidermisSheet(S, { w: S * 5.2, y: S * 1.7, amp: S * 0.14, ridges: 7 }), opts: DERMIS_BED, order: 0 },
      // dense fascia is plied: two fibril families at crossing angles, which is
      // exactly the organisation the tier should show at high magnification
      fibrilCrowd(r, 800, S, { sMin: 0.016, sMax: 0.04, posFn: slabPt(S, 4.6, 1.8, 4.6), dirFn: () => V(1, 0.35, 0.4), jitter: 0.16 }),
      fibrilCrowd(r, 800, S, { sMin: 0.016, sMax: 0.04, posFn: slabPt(S, 4.6, 1.8, 4.6), dirFn: () => V(0.35, 0.3, -1), jitter: 0.16 }),
      speckCrowd(r, 600, S, { sMin: 0.008, sMax: 0.02, posFn: slabPt(S, 4.4, 1.7, 4.4) }),
    ];
  },

  /* Free endings arborise just under the epidermis, among fine collagen. */
  free(S) {
    const r = rng(83);
    const wisps = [];
    for (let k = 0; k < 16; k++) {
      wisps.push(
        contextFibre(S, r, { rad: S * (0.5 + 0.9 * r()), ang: r() * TAU, len: S * 2.4, radius: S * 0.02, wave: 0.06 })
      );
    }
    return [
      { geom: epidermisSheet(S, { w: S * 5.4, y: S * 1.1, amp: S * 0.2, ridges: 6 }), opts: { ...DERMIS_BED, opacity: 0.18 }, order: 0 },
      { geom: merge(wisps), opts: COLLAGEN_BED },
      fibrilCrowd(r, 800, S, { sMin: 0.014, sMax: 0.034, posFn: slabPt(S, 4.6, 2.0, 4.6, -0.3), dirFn: (rr) => V(rr() * 2 - 1, (rr() - 0.5) * 0.6, rr() * 2 - 1), jitter: 0.32 }),
      speckCrowd(r, 400, S, { sMin: 0.008, sMax: 0.02, posFn: slabPt(S, 4.2, 1.8, 4.2, -0.3) }),
    ];
  },

  /* The visceral terminal already lies on its serosal membrane; give it the
     capillary bed that always accompanies one, and a second membrane below. */
  intero(S) {
    const r = rng(219);
    const caps = [];
    for (let k = 0; k < 10; k++) {
      const pts = [];
      const z0 = (r() - 0.5) * S * 3.4;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push(V(lerp(-S * 2.6, S * 2.6, t), -S * 0.16 + Math.sin(t * 7 + k * 2.1) * S * 0.1, z0 + Math.sin(t * 4 + k) * S * 0.4));
      }
      caps.push(tube(pts, () => S * 0.035, 5));
    }
    const under = new THREE.PlaneGeometry(S * 7, S * 7, 4, 4);
    under.rotateX(-Math.PI / 2);
    under.translate(0, -S * 0.5, 0);
    return [
      { geom: merge(caps), opts: { color: 0xe8506b, opacity: 0.4, rough: 0.4, spec: 0.4, rim: 0.9, mode: 'xray', xrayFloor: 0.12, doubleSide: true, sss: 0.4 } },
      { geom: under, opts: { color: 0x9fb8d8, opacity: 0.1, rough: 0.8, spec: 0.1, rim: 0.8, mode: 'xray', xrayFloor: 0.05, doubleSide: true } },
      // the mesothelial cobblestone on the membrane, and submesothelial fibrils
      speckCrowd(r, 900, S, { sMin: 0.03, sMax: 0.06, posFn: (rr) => V((rr() - 0.5) * S * 5.6, -S * 0.02 + rr() * S * 0.08, (rr() - 0.5) * S * 5.6), pal: [{ c: 0xbcd0da, w: 0.6 }, { c: 0xa5c2b8, w: 0.4 }] }),
      fibrilCrowd(r, 500, S, { sMin: 0.02, sMax: 0.05, posFn: slabPt(S, 5.4, 0.8, 5.4, -0.7), dirFn: (rr) => V(rr() * 2 - 1, (rr() - 0.5) * 0.2, rr() * 2 - 1), jitter: 0.3 }),
    ];
  },
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
    /* The subject is what framing measures; the context is the tissue bed it
       sits in. Split so the camera frames the *ending* and the bed reads as
       surroundings extending past the frame — framing the union would pull the
       camera back until the lesson is a wide shot of scenery. */
    const subject = new THREE.Group();
    subject.name = 'subject';
    const context = new THREE.Group();
    context.name = 'context';
    g.add(subject, context);

    const mats = [];
    if (built.lamellae) {
      const m = tissueMaterial({
        color: new THREE.Color(def.color).getHex(),
        /* Presence raised from the first pass — the capsule is the organ of the
           lesson, and at 0.3 it read as a hint of smoke around the coil. */
        opacity: 0.44,
        rough: 0.4,
        spec: 0.5,
        rim: 1.5,
        mode: 'xray',
        doubleSide: true,
        sss: 0.5,
        disp: 0,
      });
      const mesh = new THREE.Mesh(stripBind(built.lamellae), m);
      mesh.renderOrder = 3;
      subject.add(mesh);
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
        sss: 0.4,
        disp: 0,
      });
      const mesh = new THREE.Mesh(stripBind(built.collagen), m);
      mesh.renderOrder = 2;
      subject.add(mesh);
      mats.push(m);
    }
    if (built.axon) {
      const m = nerveMaterial({ color: 0xffd166, opacity: 1, rate: 4, speed: 1.6 });
      m.uniforms.uLocalDisp.value = 0;
      const mesh = new THREE.Mesh(stripBind(built.axon), m);
      mesh.renderOrder = 4;
      subject.add(mesh);
      mats.push(m);
    }

    const bed = CONTEXTS[id]?.(S, def);
    const beds = [];
    if (bed) {
      for (const part of bed) {
        if (part?.crowd) {
          const mesh = crowdMesh(part.crowd.base, part.crowd.items);
          mesh.renderOrder = part.order ?? 1;
          context.add(mesh);
          mats.push(mesh.material);
          beds.push(mesh);
          continue;
        }
        if (!part?.geom) continue;
        const m = tissueMaterial({ disp: 0, ...part.opts });
        const mesh = new THREE.Mesh(stripBind(part.geom), m);
        mesh.renderOrder = part.order ?? 1;
        context.add(mesh);
        mats.push(m);
      }
    }

    root.add(g);
    models.set(id, { id, def, group: g, subject, context, materials: mats, crowds: beds, size: S });
  }

  /* Quality lever: the beds are pure presentation, so the weakest tier simply
     does not draw them, and the middle tier draws a scaled share of the
     instanced fibril and speck populations. Everything else about the mode —
     the subject, the read-out, the spike raster — is identical on every tier. */
  const setDetail = (f) => {
    const share = f < 0.35 ? 0.1 : Math.min(1, f * 1.28);
    for (const [, m] of models) {
      m.context.visible = f >= 0.35;
      for (const c of m.crowds) {
        c.geometry.instanceCount = Math.max(24, Math.round(c.userData.fullCount * share));
      }
    }
  };

  return { root, models, setDetail };
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
