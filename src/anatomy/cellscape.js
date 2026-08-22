/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   The cellular tier — a schematic living cell interior.

   Below the receptor tier the microscope arrives inside the tissue's own
   cells. This module builds one archetype — a fibroblast-like cell in its
   endomysial matrix — in the visual language of integrative cell
   reconstructions: a sectionable membrane cortex, packed organelles,
   cytoskeletal filaments, and a dense multi-coloured molecular crowd.

   It is an illustrative composition, and everything about it says so in the
   help and the read-out: nothing here is reconstructed from any imaging
   dataset, no count or size is a measurement, and the display sizes of the
   molecular complexes are exaggerated to remain legible. What *is* live is
   the mechanics: the cell stretches with the same solved element the
   spindle reads, the stress fibres brighten with strain and strain rate,
   and the molecular crowd seethes only while the physiology runs.

   Cost discipline: the crowd is instanced (one draw call per population,
   thousands of instances, per-instance jitter computed in the vertex
   shader), the organelles are merged, and the quality tier scales the
   crowd's instanceCount — the Low tier draws a tenth of it.

   Deliberately not in the ID manifest: selection and datasets are
   macro-scale concerns, none of the property machinery has anything true
   to say about a schematic organelle, and the manifest is a compatibility
   contract that must not grow for scenery. If a cellular structure ever
   carries data, registering it then is a one-line change.
   ============================================================ */

import * as THREE from 'three';
import { tube, merge, loft, place, ribbon } from './build.js';
import { tissueMaterial, GLOBAL } from '../gfx/materials.js';
import { rng, lerp, clamp, TAU, approach } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Cell radius scale unit, metres. The cell body spans roughly 2S × 1.9S. */
const S = 9e-6;

/* ------------------------------------------------------------
   The molecular crowd — instanced, one shader for every population
   ------------------------------------------------------------ */

const CROWD_VERT = /* glsl */ `
  attribute vec3  iOffset;
  attribute float iScale;
  attribute vec3  iColor;
  attribute float iSeed;
  attribute vec4  iQuat;

  uniform float uTime;
  uniform float uJitter;

  varying vec3 vCol;
  varying vec3 vNrm;
  varying vec3 vWPos;

  vec3 qrot(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  void main() {
    vCol = iColor;
    // Brownian seethe, free per instance: three incommensurate sines seeded
    // per complex. Amplitude is a fraction of the complex's own size, so big
    // things lumber and small things skitter.
    vec3 jig = vec3(
      sin(uTime * 2.3 + iSeed * 17.0),
      sin(uTime * 2.9 + iSeed * 29.0),
      cos(uTime * 2.1 + iSeed * 23.0)
    ) * uJitter * iScale * 0.55;
    vec3 p = iOffset + jig + qrot(iQuat, position * iScale);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWPos = wp.xyz;
    vNrm = normalize(mat3(modelMatrix) * qrot(iQuat, normal));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CROWD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uCamPos;
  uniform float uCutDist;
  uniform float uOpacity;
  varying vec3 vCol;
  varying vec3 vNrm;
  varying vec3 vWPos;

  void main() {
    vec3 toCam = uCamPos - vWPos;
    float d = length(toCam);
    // honour the optical section: complexes in the cut-away region vanish
    // with the tissue in front of them
    if (uCutDist > 0.0 && d < uCutDist * 1.06) discard;
    vec3 V = toCam / d;
    vec3 N = normalize(vNrm);
    if (dot(N, V) < 0.0) N = -N;

    const vec3 KEY_DIR = vec3(-0.420566, 0.720971, 0.550742);
    float wrap = max((dot(N, KEY_DIR) + 0.42) / 1.42, 0.0);
    vec3 hemi = mix(vec3(0.16, 0.10, 0.09), vec3(0.10, 0.14, 0.19), N.y * 0.5 + 0.5);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    vec3 col = vCol * (wrap * 0.95 + 0.26) + vCol * hemi + vCol * fres * 0.5;
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

function crowdMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CROWD_VERT,
    fragmentShader: CROWD_FRAG,
    uniforms: {
      uTime: GLOBAL.uTime,
      uCamPos: GLOBAL.uCamPos,
      uCutDist: GLOBAL.uCutDist,
      uJitter: { value: 0.15 },
      uOpacity: { value: 1 },
    },
    transparent: true, // opacity animates during the tier fade
    depthWrite: true,
  });
}

/**
 * One instanced population.
 * @param {THREE.BufferGeometry} base   the per-instance shape
 * @param {Array} items                 [{p:Vector3, s:number, c:Color, q:Quaternion}]
 */
function crowdMesh(base, items) {
  const n = items.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('normal', base.getAttribute('normal'));
  const off = new Float32Array(n * 3);
  const scl = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const quat = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    off.set([it.p.x, it.p.y, it.p.z], i * 3);
    scl[i] = it.s;
    col.set([it.c.r, it.c.g, it.c.b], i * 3);
    seed[i] = i * 0.6180339887 % 1;
    quat.set([it.q.x, it.q.y, it.q.z, it.q.w], i * 4);
  }
  geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scl, 1));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geo.setAttribute('iQuat', new THREE.InstancedBufferAttribute(quat, 4));
  geo.instanceCount = n;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), S * 6);
  const mesh = new THREE.Mesh(geo, crowdMaterial());
  mesh.userData.fullCount = n;
  return mesh;
}

/** Random unit quaternion. */
function randQuat(r) {
  const u1 = r();
  const u2 = r() * TAU;
  const u3 = r() * TAU;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return new THREE.Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/* Molecular palette — one hue per family, weighted the way the cytoplasm is
   actually dominated (ribosomes everywhere). Colours are identification aids
   in the tradition of cell-landscape illustration, not measurements. */
const CYTO_PALETTE = [
  { c: 0xf2b23c, w: 0.34 }, // ribosomes
  { c: 0xd94f70, w: 0.1 },  // proteasomes
  { c: 0x46c8b4, w: 0.1 },  // chaperonins
  { c: 0x9ee04c, w: 0.08 }, // motor proteins
  { c: 0x7f6ff0, w: 0.1 },  // polymerases & large complexes
  { c: 0xe07b3c, w: 0.11 }, // metabolic enzymes
  { c: 0x58a8f0, w: 0.09 }, // signalling proteins
  { c: 0xe8e0c8, w: 0.08 }, // glycogen granules
];
const NUCLEUS_PALETTE = [
  { c: 0x8a76e8, w: 0.5 },
  { c: 0x6a5ae0, w: 0.3 },
  { c: 0xb49af0, w: 0.2 },
];
const STUD_PALETTE = [
  { c: 0xf0c040, w: 0.5 },
  { c: 0xd94f70, w: 0.25 },
  { c: 0x58a8f0, w: 0.25 },
];

function pick(palette, r) {
  let t = r();
  for (const p of palette) {
    t -= p.w;
    if (t <= 0) return new THREE.Color(p.c);
  }
  return new THREE.Color(palette[0].c);
}

/* Membrane ellipsoid radii (× S). */
const MEM = { a: 1.15, b: 0.95, c: 1.05 };
/* Nucleus centre and radius (× S). */
const NUC = { x: -0.28, y: 0.08, z: 0.05, r: 0.44 };

const insideNucleus = (p, pad = 1.12) => {
  const dx = p.x / S - NUC.x;
  const dy = p.y / S - NUC.y;
  const dz = p.z / S - NUC.z;
  return dx * dx + dy * dy + dz * dz < NUC.r * NUC.r * pad * pad;
};

/** Random point inside the membrane ellipsoid, outside the nucleus. */
function cytoPoint(r, shrink = 0.92) {
  for (let k = 0; k < 40; k++) {
    const u = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (u.lengthSq() > 1) continue;
    const p = V(u.x * MEM.a * shrink * S, u.y * MEM.b * shrink * S, u.z * MEM.c * shrink * S);
    if (insideNucleus(p)) continue;
    return p;
  }
  return V(MEM.a * 0.6 * S, 0, 0);
}

/* ------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------ */

/**
 * Ellipsoid at cellular scale. build.js's blob() floors its profile radii at
 * 10 µm — harmless padding on an organ, but *larger than most of this scene*:
 * run through it, a two-micron mitochondrion explodes into a ten-micron tube.
 * Same construction, floor five orders lower.
 */
function microBlob(rx, ry, rz, seg = 16) {
  const axis = [];
  const profiles = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const ang = (t - 0.5) * Math.PI;
    const y = Math.sin(ang) * ry;
    const k = Math.sqrt(Math.max(0, 1 - (y / ry) * (y / ry)));
    axis.push(V(0, y, 0));
    profiles.push({ a: Math.max(1e-9, rx * k), b: Math.max(1e-9, rz * k), n: 2 });
  }
  return loft(axis, profiles, seg, { refUp: V(0, 0, 1), capStart: false, capEnd: false });
}

/** Neutral solver bindings, so tissueMaterial's vertex program is a no-op move. */
function neutralBind(geom) {
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
    const h = Math.max(1e-12, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      uv[i * 2] = 0.5;
      uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return geom;
}

/** A wavy filament between two points. */
function filament(r, from, to, radius, wobble) {
  const pts = [];
  const n = 7;
  const ph = r() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = from.clone().lerp(to, t);
    p.x += Math.sin(t * 5.2 + ph) * wobble;
    p.y += Math.cos(t * 4.1 + ph * 1.7) * wobble;
    p.z += Math.sin(t * 6.3 + ph * 0.6) * wobble;
    pts.push(p);
  }
  return tube(pts, () => radius, 4);
}

/* ------------------------------------------------------------
   Assembly
   ------------------------------------------------------------ */

export function buildCellscape() {
  const root = new THREE.Group();
  root.name = 'cellscape';
  root.visible = false;
  const subject = new THREE.Group();
  subject.name = 'subject';
  const context = new THREE.Group();
  context.name = 'context';
  root.add(subject, context);

  const materials = [];
  const crowds = [];
  const r = rng(20260822);

  const addMesh = (parent, geom, opts, order = 1) => {
    /* forceAmount 0: cell parts carry neutral solver bindings (texel 0), so
       the whole-body tension ramp would recolour them by an unrelated
       element's load. Identification colour is the point at this tier; the
       live mechanics arrive through stretch, jitter and the adhesion drive. */
    const m = tissueMaterial({ disp: 0, forceAmount: 0, ...opts });
    const mesh = new THREE.Mesh(neutralBind(geom), m);
    mesh.renderOrder = order;
    parent.add(mesh);
    materials.push(m);
    return { mesh, material: m };
  };

  /* ---- plasma membrane — sectioned open by the depth-of-interest slab ---- */
  addMesh(
    subject,
    microBlob(MEM.a * S, MEM.b * S, MEM.c * S, 28),
    { color: 0xd8b49a, opacity: 0.36, rough: 0.6, spec: 0.3, rim: 0.9, mode: 'xray', xrayFloor: 0.05, doubleSide: true, sss: 0.5, wobble: S * 0.012 },
    8
  );

  /* ---- nucleus: envelope, chromatin crowd, nucleolus ---- */
  const nc = V(NUC.x * S, NUC.y * S, NUC.z * S);
  addMesh(
    subject,
    place(microBlob(NUC.r * S, NUC.r * 0.94 * S, NUC.r * S, 20), { pos: [nc.x, nc.y, nc.z] }),
    { color: 0x8a7ddb, opacity: 0.52, rough: 0.55, spec: 0.35, rim: 1.2, mode: 'xray', xrayFloor: 0.08, doubleSide: true, sss: 0.45 },
    6
  );
  addMesh(
    subject,
    place(microBlob(NUC.r * 0.34 * S, NUC.r * 0.3 * S, NUC.r * 0.32 * S, 12), { pos: [nc.x + S * 0.05, nc.y - S * 0.03, nc.z] }),
    { color: 0x5a4ab0, opacity: 0.92, rough: 0.5, spec: 0.4, rim: 0.6, sss: 0.2 },
    2
  );

  /* ---- mitochondria — cristae as banded striation ---- */
  {
    const parts = [];
    for (let k = 0; k < 12; k++) {
      // large enough to read as landmarks over the granular crowd, small
      // enough not to read as petals when the Low tier thins that crowd
      const L = S * (0.24 + 0.14 * r());
      const w = S * (0.08 + 0.03 * r());
      const g = microBlob(w, L, w, 10);
      const p = cytoPoint(r, 0.8);
      place(g, { pos: [p.x, p.y, p.z], rot: [r() * TAU, r() * TAU, r() * TAU] });
      parts.push(g);
    }
    addMesh(subject, merge(parts), {
      // crimson, deliberately far from ribosome amber — at full crowd density
      // an orange mitochondrion vanished into the granules around it
      color: 0xcf4030,
      opacity: 0.9,
      rough: 0.45,
      spec: 0.45,
      rim: 0.5,
      stripe: 0.75,
      stripeFreq: 60,
      sss: 0.3,
    }, 2);
  }

  /* ---- endoplasmic reticulum — curved sheets wrapping the nucleus ---- */
  {
    const sheets = [];
    for (let k = 0; k < 6; k++) {
      const a0 = r() * TAU;
      const rad = NUC.r * S * (1.35 + k * 0.16);
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const a = a0 + t * (1.6 + r() * 0.9);
        pts.push(
          V(
            nc.x + Math.cos(a) * rad,
            nc.y + (t - 0.5) * S * 0.3 + Math.sin(t * 6 + k) * S * 0.05,
            nc.z + Math.sin(a) * rad * 0.9
          )
        );
      }
      sheets.push(ribbon(pts, () => S * (0.14 + 0.06 * r()), { refUp: V(0, 1, 0) }));
    }
    addMesh(subject, merge(sheets), {
      color: 0x7fd0f0,
      opacity: 0.5,
      rough: 0.6,
      spec: 0.3,
      rim: 1.0,
      mode: 'xray',
      xrayFloor: 0.14,
      doubleSide: true,
      sss: 0.4,
    }, 3);
  }

  /* ---- Golgi — a stack of cupped discs ---- */
  {
    const parts = [];
    const gp = V(S * 0.34, S * -0.18, S * -0.3);
    for (let k = 0; k < 5; k++) {
      const g = microBlob(S * (0.2 - k * 0.016), S * 0.022, S * (0.16 - k * 0.012), 10);
      place(g, { pos: [gp.x, gp.y + k * S * 0.055, gp.z], rot: [0.3, 0, 0.12] });
      parts.push(g);
    }
    addMesh(subject, merge(parts), { color: 0x59d8b0, opacity: 0.62, rough: 0.55, spec: 0.35, rim: 0.8, mode: 'xray', xrayFloor: 0.2, doubleSide: true, sss: 0.35 }, 3);
  }

  /* ---- microtubules — radiating from the centrosome ---- */
  {
    const parts = [];
    const org = V(nc.x + NUC.r * S * 1.5, nc.y + S * 0.1, nc.z);
    for (let k = 0; k < 22; k++) {
      const dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const end = org.clone().addScaledVector(dir, S * (0.7 + 0.6 * r()));
      end.x = clamp(end.x, -MEM.a * S * 0.94, MEM.a * S * 0.94);
      end.y = clamp(end.y, -MEM.b * S * 0.94, MEM.b * S * 0.94);
      end.z = clamp(end.z, -MEM.c * S * 0.94, MEM.c * S * 0.94);
      parts.push(filament(r, org, end, S * 0.009, S * 0.03));
    }
    addMesh(subject, merge(parts), { color: 0x74e074, opacity: 0.66, rough: 0.5, spec: 0.35, rim: 0.9, mode: 'xray', xrayFloor: 0.3, doubleSide: true }, 3);
  }

  /* ---- cortical actin + stress fibres + focal adhesions ----
     The mechanotransduction thread at this depth: adhesions stud the
     membrane where the matrix attaches, stress fibres span between them,
     and the whole assembly brightens with the live strain. */
  const tensionMats = [];
  {
    const cortex = [];
    for (let k = 0; k < 70; k++) {
      const dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const at = V(dir.x * MEM.a * S * 0.96, dir.y * MEM.b * S * 0.96, dir.z * MEM.c * S * 0.96);
      const tangent = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).cross(dir).normalize();
      const from = at.clone().addScaledVector(tangent, -S * 0.14);
      const to = at.clone().addScaledVector(tangent, S * 0.14);
      cortex.push(filament(r, from, to, S * 0.006, S * 0.02));
    }
    const cortexMat = addMesh(subject, merge(cortex), { color: 0xe86a8a, opacity: 0.55, rough: 0.5, spec: 0.3, rim: 0.8, mode: 'xray', xrayFloor: 0.3, doubleSide: true }, 3);
    tensionMats.push(cortexMat.material);

    const adhesionPts = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + r() * 0.3;
      const y = (r() - 0.55) * MEM.b * S * 1.1;
      const dir = V(Math.cos(a), y / (MEM.b * S), Math.sin(a)).normalize();
      adhesionPts.push(V(dir.x * MEM.a * S, dir.y * MEM.b * S, dir.z * MEM.c * S));
    }
    const pads = [];
    for (const p of adhesionPts) {
      const g = microBlob(S * 0.05, S * 0.02, S * 0.05, 6);
      place(g, { pos: [p.x, p.y, p.z] });
      pads.push(g);
    }
    const padMat = addMesh(subject, merge(pads), { color: 0xff8f6a, opacity: 0.95, rough: 0.4, spec: 0.5, rim: 0.6, emissive: 0.15 }, 4);
    tensionMats.push(padMat.material);

    const fibres = [];
    for (let k = 0; k < 8; k++) {
      const a = adhesionPts[k];
      const b = adhesionPts[(k + 5) % adhesionPts.length];
      fibres.push(filament(r, a.clone().multiplyScalar(0.97), b.clone().multiplyScalar(0.97), S * 0.014, S * 0.04));
    }
    const fibreMat = addMesh(subject, merge(fibres), { color: 0xe85a7e, opacity: 0.85, rough: 0.45, spec: 0.4, rim: 0.7, stripe: 0.5, stripeFreq: 18, emissive: 0.1 }, 4);
    tensionMats.push(fibreMat.material);
  }

  /* ---- molecular crowds ---- */
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const rod = new THREE.CylinderGeometry(0.38, 0.38, 2.3, 5, 1, false);

  {
    const items = [];
    for (let k = 0; k < 5200; k++) {
      items.push({ p: cytoPoint(r), s: S * (0.016 + 0.03 * r() * r()), c: pick(CYTO_PALETTE, r), q: randQuat(r) });
    }
    const m = crowdMesh(ico, items);
    m.renderOrder = 1;
    subject.add(m);
    crowds.push(m);
  }
  {
    const items = [];
    for (let k = 0; k < 700; k++) {
      items.push({ p: cytoPoint(r), s: S * (0.014 + 0.02 * r()), c: pick(CYTO_PALETTE, r), q: randQuat(r) });
    }
    const m = crowdMesh(rod, items);
    m.renderOrder = 1;
    subject.add(m);
    crowds.push(m);
  }
  {
    // chromatin — the nuclear crowd
    const items = [];
    for (let k = 0; k < 900; k++) {
      let p;
      for (let i = 0; i < 20; i++) {
        const u = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
        if (u.lengthSq() > 1) continue;
        p = V(nc.x + u.x * NUC.r * S * 0.9, nc.y + u.y * NUC.r * S * 0.85, nc.z + u.z * NUC.r * S * 0.9);
        break;
      }
      if (!p) continue;
      items.push({ p, s: S * (0.015 + 0.018 * r()), c: pick(NUCLEUS_PALETTE, r), q: randQuat(r) });
    }
    const m = crowdMesh(ico, items);
    m.renderOrder = 1;
    subject.add(m);
    crowds.push(m);
  }
  {
    // membrane-studded proteins
    const items = [];
    for (let k = 0; k < 500; k++) {
      const dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const p = V(dir.x * MEM.a * S, dir.y * MEM.b * S, dir.z * MEM.c * S);
      items.push({ p, s: S * (0.02 + 0.016 * r()), c: pick(STUD_PALETTE, r), q: randQuat(r) });
    }
    const m = crowdMesh(ico, items);
    m.renderOrder = 8;
    subject.add(m);
    crowds.push(m);
  }

  /* ---- context: the matrix outside, and the hint of neighbours ---- */
  {
    const fibrils = [];
    for (let k = 0; k < 20; k++) {
      const a = r() * TAU;
      const off = S * (1.5 + 1.4 * r());
      const from = V(Math.cos(a) * off, -S * 2.4, Math.sin(a) * off * 0.8);
      const to = V(Math.cos(a + 0.4) * off * 0.9, S * 2.4, Math.sin(a + 0.4) * off * 0.85);
      fibrils.push(filament(r, from, to, S * (0.016 + 0.02 * r()), S * 0.12));
    }
    addMesh(context, merge(fibrils), { color: 0xd9cfae, opacity: 0.4, rough: 0.6, spec: 0.28, rim: 0.9, mode: 'xray', xrayFloor: 0.16, doubleSide: true, stripe: 0.5, stripeFreq: 20, sss: 0.35 }, 1);

    const neighbours = [];
    for (const [x, z] of [[2.9, 1.1], [-2.6, -1.8]]) {
      const g = microBlob(S * 1.1, S * 0.9, S * 1.0, 14);
      place(g, { pos: [x * S, (r() - 0.5) * S, z * S] });
      neighbours.push(g);
    }
    addMesh(context, merge(neighbours), { color: 0xc9a08a, opacity: 0.12, rough: 0.7, spec: 0.15, rim: 0.9, mode: 'xray', xrayFloor: 0.04, doubleSide: true, sss: 0.4 }, 0);
  }

  for (const m of materials) m.userData.cellBase = m.uniforms.uOpacity.value;

  /* ---------------- runtime ---------------- */

  let jitter = 0.15;

  /** Quality lever: the crowd is the cost, so the crowd is the knob. */
  function setDetail(f) {
    const share = f < 0.35 ? 0.1 : Math.min(1, f * 1.28);
    for (const m of crowds) {
      m.geometry.instanceCount = Math.max(24, Math.round(m.userData.fullCount * share));
    }
    context.visible = f >= 0.35;
  }

  /**
   * Per-frame drive. Everything meaningful here comes from the same solve
   * that moves the whole body: `strain` and `velocity` are the spindle's
   * element read straight from the solver, so the cell stretches with the
   * muscle it lives in and its adhesion machinery lights under load.
   */
  function update(dt, { blend = 1, strain = 0, velocity = 0, running = true } = {}) {
    for (const m of materials) m.uniforms.uOpacity.value = m.userData.cellBase * blend;
    for (const m of crowds) m.material.uniforms.uOpacity.value = blend;

    // same display amplification and volume convention as the spindle capsule
    const axial = clamp(1 + strain * 18, 0.72, 1.45);
    const transverse = 1 / Math.sqrt(axial);
    subject.scale.set(transverse, axial, transverse);

    jitter = approach(jitter, running ? 1 : 0.12, 2.5, dt);
    for (const m of crowds) m.material.uniforms.uJitter.value = jitter;

    // stress fibres and adhesions brighten with load and loading rate
    const drive = clamp(Math.abs(strain) * 30 + Math.abs(velocity) * 2, 0, 0.85);
    for (const m of tensionMats) m.uniforms.uEmissive.value = 0.1 + drive;
  }

  const state = () => ({
    archetype: 'fibroblast-like (schematic composition — illustrative, not reconstructed from imaging data)',
    spanM: S * 2,
    crowdDrawn: crowds.reduce((n, m) => n + m.geometry.instanceCount, 0),
    crowdFull: crowds.reduce((n, m) => n + m.userData.fullCount, 0),
    jitter: +jitter.toFixed(2),
  });

  return { root, subject, context, materials, crowds, setDetail, update, state };
}
