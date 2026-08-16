/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Anatomical reference frame.

   Coordinates in metres for a 1.75 m adult in anatomical position.
     +Y  cranial (0 = floor)
     +Z  anterior
     +X  the subject's left
   Every structure in the model is generated from these landmarks so
   the systems stay registered to one another.
   ============================================================ */

import * as THREE from 'three';
import { spline, sample } from './build.js';
import { lerp, clamp } from '../core/util.js';

export const HEIGHT = 1.75;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Named skeletal / surface landmarks. Lateral pairs use `side` (+1 = left). */
export const LM = {
  vertex: V(0, 1.75, 0.005),
  glabella: V(0, 1.663, 0.086),
  chin: V(0, 1.548, 0.076),
  occiput: V(0, 1.652, -0.086),
  mastoid: V(0.048, 1.585, -0.018),
  jugularNotch: V(0, 1.398, 0.062),
  sternumMid: V(0, 1.305, 0.078),
  xiphoid: V(0, 1.212, 0.076),
  acromion: V(0.178, 1.412, 0.004),
  glenoid: V(0.158, 1.392, 0.006),
  elbow: V(0.225, 1.086, -0.008),
  wrist: V(0.262, 0.842, 0.016),
  midHand: V(0.271, 0.762, 0.03),
  fingerTip: V(0.278, 0.686, 0.038),
  hipJoint: V(0.088, 0.926, 0.006),
  iliacCrest: V(0.128, 1.038, -0.006),
  asis: V(0.112, 1.008, 0.062),
  pubis: V(0.014, 0.932, 0.048),
  ischium: V(0.062, 0.878, -0.05),
  knee: V(0.06, 0.478, 0.008),
  ankle: V(0.052, 0.075, -0.012),
  heel: V(0.052, 0.032, -0.056),
  midFoot: V(0.056, 0.045, 0.048),
  toeTip: V(0.058, 0.026, 0.126),
};

/** mirrored copy of a landmark */
export const side = (v, s) => new THREE.Vector3(v.x * s, v.y, v.z);

/* ------------------------------------------------------------
   Vertebral column
   ------------------------------------------------------------ */

/** Vertebral body centres, cranial → caudal, with the three normal curves. */
export const VERTEBRAE = (() => {
  const out = [];
  const defs = [
    // [label, count, yTop, yBottom, zTop, zBottom, radius]
    ['C', 7, 1.565, 1.442, -0.014, -0.036, 0.0125],
    ['T', 12, 1.428, 1.168, -0.04, -0.046, 0.0155],
    ['L', 5, 1.142, 0.998, -0.04, -0.038, 0.019],
  ];
  for (const [pre, count, yT, yB, zT, zB, r] of defs) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const y = lerp(yT, yB, t);
      let z = lerp(zT, zB, t);
      // superimpose the regional curvature
      if (pre === 'C') z += Math.sin(t * Math.PI) * 0.019; // lordosis: anterior convexity
      if (pre === 'T') z -= Math.sin(t * Math.PI) * 0.021; // kyphosis
      if (pre === 'L') z += Math.sin(t * Math.PI) * 0.026; // lordosis
      out.push({ label: `${pre}${i + 1}`, region: pre, pos: V(0, y, z), r });
    }
  }
  // sacrum + coccyx as a single caudal wedge chain
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    out.push({
      label: `S${i + 1}`,
      region: 'S',
      pos: V(0, lerp(0.982, 0.888, t), lerp(-0.044, -0.072, t)),
      r: lerp(0.021, 0.011, t),
    });
  }
  return out;
})();

export const vertebra = (label) => VERTEBRAE.find((v) => v.label === label);

/** Smooth curve through all vertebral bodies — used for the cord and the deep front line. */
export const SPINE_CURVE = spline(VERTEBRAE.map((v) => v.pos), 0.5);

/** y → interpolated spine position (anterior surface of the bodies). */
export function spineAt(y) {
  const arr = VERTEBRAE;
  if (y >= arr[0].pos.y) return arr[0].pos.clone();
  if (y <= arr[arr.length - 1].pos.y) return arr[arr.length - 1].pos.clone();
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i].pos;
    const b = arr[i + 1].pos;
    if (y <= a.y && y >= b.y) {
      const t = (a.y - y) / Math.max(1e-6, a.y - b.y);
      return a.clone().lerp(b, t);
    }
  }
  return V(0, y, -0.04);
}

/* ------------------------------------------------------------
   Trunk envelope
   ------------------------------------------------------------ */

/**
 * Cross-section of the trunk / head envelope as a function of height.
 * Returns half-width (x), half-depth (z), centre-z and a superellipse
 * exponent. These numbers set the silhouette of the whole figure, so
 * the fascial sheets, skin and organs all read from here.
 */
const TRUNK_STATIONS = [
  // y,     halfW, halfD, zCen, exp
  // The envelope runs down over the buttock and upper thigh so the limb sleeves
  // emerge from inside it rather than butting against a cut edge.
  [0.78, 0.132, 0.104, -0.012, 2.6],
  [0.84, 0.146, 0.11, -0.01, 2.55],
  [0.9, 0.152, 0.108, -0.004, 2.5],
  [0.96, 0.15, 0.108, 0.0, 2.45],
  [1.02, 0.148, 0.107, 0.004, 2.4],
  [1.08, 0.14, 0.1, 0.006, 2.3],
  [1.14, 0.135, 0.098, 0.008, 2.25],
  [1.2, 0.136, 0.101, 0.008, 2.25],
  [1.26, 0.142, 0.105, 0.006, 2.3],
  [1.32, 0.146, 0.104, 0.004, 2.35],
  [1.38, 0.148, 0.1, 0.0, 2.4],
  [1.42, 0.15, 0.095, -0.004, 2.45],
  [1.45, 0.128, 0.086, -0.006, 2.4],
  [1.48, 0.078, 0.07, -0.004, 2.2],
  [1.52, 0.058, 0.062, 0.0, 2.1],
  [1.56, 0.055, 0.062, 0.006, 2.1],
  [1.6, 0.066, 0.077, 0.006, 2.1],
  [1.65, 0.075, 0.089, 0.002, 2.05],
  [1.69, 0.073, 0.086, -0.002, 2.05],
  [1.72, 0.06, 0.07, -0.006, 2.0],
  [1.745, 0.03, 0.036, -0.008, 2.0],
];

export function trunkSection(y) {
  const S = TRUNK_STATIONS;
  if (y <= S[0][0]) return { a: S[0][1], b: S[0][2], z: S[0][3], n: S[0][4] };
  const last = S[S.length - 1];
  if (y >= last[0]) return { a: last[1], b: last[2], z: last[3], n: last[4] };
  for (let i = 0; i < S.length - 1; i++) {
    if (y >= S[i][0] && y <= S[i + 1][0]) {
      const t = (y - S[i][0]) / (S[i + 1][0] - S[i][0]);
      return {
        a: lerp(S[i][1], S[i + 1][1], t),
        b: lerp(S[i][2], S[i + 1][2], t),
        z: lerp(S[i][3], S[i + 1][3], t),
        n: lerp(S[i][4], S[i + 1][4], t),
      };
    }
  }
  return { a: 0.14, b: 0.1, z: 0, n: 2.3 };
}

/** Trunk axis stations used by every lofted trunk layer. */
export function trunkAxis(y0 = 0.79, y1 = 1.748, steps = 30) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const y = lerp(y0, y1, i / steps);
    const s = trunkSection(y);
    out.push({ y, pos: V(0, y, s.z), sec: s });
  }
  return out;
}

/**
 * Surface point on the trunk envelope.
 * @param {number} y      height
 * @param {number} theta  0 = anterior midline, +π/2 = subject's left
 * @param {number} inset  metres inward from the surface (negative = outward)
 */
export function trunkSurface(y, theta, inset = 0) {
  const s = trunkSection(y);
  const a = Math.max(0.004, s.a - inset);
  const b = Math.max(0.004, s.b - inset);
  const e = 2 / s.n;
  const c = Math.cos(theta);
  const si = Math.sin(theta);
  const z = Math.sign(c) * Math.pow(Math.abs(c), e) * b + s.z;
  const x = Math.sign(si) * Math.pow(Math.abs(si), e) * a;
  return V(x, y, z);
}

/* ------------------------------------------------------------
   Limb chains
   ------------------------------------------------------------ */

export function armChain(s = 1) {
  return [side(LM.glenoid, s), side(LM.elbow, s), side(LM.wrist, s), side(LM.midHand, s)];
}

export function legChain(s = 1) {
  return [side(LM.hipJoint, s), side(LM.knee, s), side(LM.ankle, s)];
}

/** Limb girth as a fraction of station radius — thigh and calf bellies. */
export function legRadius(t) {
  // t: 0 hip → 1 ankle
  const thigh = 0.088 - 0.024 * clamp(t / 0.52);
  const calf = 0.062 - 0.036 * clamp((t - 0.52) / 0.48);
  const belly = 0.012 * Math.sin(clamp((t - 0.55) / 0.3) * Math.PI);
  return (t < 0.52 ? thigh : calf) + belly;
}

export function armRadius(t) {
  const upper = 0.049 - 0.008 * clamp(t / 0.5);
  const fore = 0.045 - 0.021 * clamp((t - 0.5) / 0.5);
  return t < 0.5 ? upper : fore;
}

/* ------------------------------------------------------------
   Rib cage
   ------------------------------------------------------------ */

/**
 * One rib, from its vertebral origin round to the sternum or the free
 * costal margin. Ribs 1–7 are true (reach the sternum), 8–10 join the
 * costal arch, 11–12 float.
 */
export function ribPath(i, s = 1) {
  const t = i / 11;
  const vt = vertebra(`T${i + 1}`) || vertebra('T12');
  const start = V(vt.pos.x + s * 0.014, vt.pos.y, vt.pos.z - 0.004);

  // lateral extent peaks around rib 8
  const widthK = 0.62 + 0.5 * Math.sin(clamp(t * 1.05) * Math.PI * 0.92);
  const maxW = 0.148 * widthK;
  const drop = 0.052 + 0.055 * t; // how far the rib descends front-to-back
  const antY = vt.pos.y - drop;

  let endX;
  let endZ;
  if (i < 7) {
    endX = s * (0.012 + 0.004 * i);
    endZ = lerp(0.062, 0.076, t * 1.5) * (1 - 0.06 * i);
  } else if (i < 10) {
    endX = s * (0.052 + 0.016 * (i - 7));
    endZ = 0.062 - 0.012 * (i - 7);
  } else {
    endX = s * (0.104 + 0.012 * (i - 10));
    endZ = -0.006 - 0.014 * (i - 10);
  }

  const pts = [
    start,
    V(s * (0.03 + maxW * 0.28), vt.pos.y - drop * 0.06, vt.pos.z - 0.03),
    V(s * maxW * 0.82, vt.pos.y - drop * 0.3, vt.pos.z + 0.012),
    V(s * maxW, vt.pos.y - drop * 0.62, 0.024),
    V(s * maxW * 0.78, antY + drop * 0.12, 0.05),
    V(endX, antY, endZ),
  ];
  return spline(pts, 0.5);
}

export const ribPoints = (i, s, n = 22) => sample(ribPath(i, s), n);

/* ------------------------------------------------------------
   Named regions — used for camera framing and the region scale tier
   ------------------------------------------------------------ */

export const REGIONS = {
  cranium: { center: V(0, 1.66, 0.0), span: 0.3, label: 'Cranium' },
  cervical: { center: V(0, 1.5, -0.01), span: 0.28, label: 'Cervical region' },
  thorax: { center: V(0, 1.3, 0.0), span: 0.44, label: 'Thorax' },
  abdomen: { center: V(0, 1.09, 0.01), span: 0.4, label: 'Abdomen' },
  pelvis: { center: V(0, 0.94, 0.0), span: 0.34, label: 'Pelvis' },
  thoracolumbar: { center: V(0, 1.09, -0.06), span: 0.36, label: 'Thoracolumbar region' },
  shoulder: { center: V(0.16, 1.36, 0.0), span: 0.3, label: 'Shoulder girdle' },
  hand: { center: V(0.27, 0.75, 0.03), span: 0.18, label: 'Hand' },
  knee: { center: V(0.06, 0.48, 0.01), span: 0.22, label: 'Knee' },
  foot: { center: V(0.056, 0.05, 0.04), span: 0.2, label: 'Foot' },
  wholeBody: { center: V(0, 0.95, 0), span: 2.05, label: 'Whole body' },
};
