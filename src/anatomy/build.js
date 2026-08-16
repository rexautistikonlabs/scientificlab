/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Procedural geometry toolkit.

   Everything in the model is generated at load time from a small
   number of parametric primitives: lofted cross-section stacks
   (bodies, limbs, organs), variable-radius tubes (bones, vessels,
   nerves), ribbons (fascial planes, myofascial continuities) and
   parametric sheets (membranes, diaphragm, mesentery).

   All builders emit position / normal / uv so results can be
   merged freely.
   ============================================================ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, TAU } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ------------------------------------------------------------
   Frames
   ------------------------------------------------------------ */

/**
 * Parallel-transport frames along a polyline. Avoids the flipping you
 * get from naive per-point cross products, which matters for the long
 * myofascial ribbons.
 */
export function transportFrames(points, refUp = new THREE.Vector3(0, 0, 1)) {
  const n = points.length;
  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    tangents.push(_v.copy(b).sub(a).normalize().clone());
  }
  const normals = [];
  const binormals = [];
  // seed a normal orthogonal to the first tangent
  let nrm = new THREE.Vector3().crossVectors(tangents[0], refUp);
  if (nrm.lengthSq() < 1e-8) nrm.crossVectors(tangents[0], new THREE.Vector3(1, 0, 0));
  nrm.normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // rotate the previous normal by the rotation that takes t[i-1] → t[i]
      const t0 = tangents[i - 1];
      const t1 = tangents[i];
      const axis = _v.crossVectors(t0, t1);
      const len = axis.length();
      if (len > 1e-7) {
        axis.divideScalar(len);
        const ang = Math.atan2(len, t0.dot(t1));
        nrm = nrm.clone().applyAxisAngle(axis, ang);
      } else {
        nrm = nrm.clone();
      }
      // re-orthogonalise against drift
      nrm.sub(_v2.copy(t1).multiplyScalar(nrm.dot(t1))).normalize();
    }
    normals.push(nrm.clone());
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], nrm).normalize());
  }
  return { tangents, normals, binormals };
}

/* ------------------------------------------------------------
   Cross-section helpers
   ------------------------------------------------------------ */

/** Superellipse point at angle t. n=2 → ellipse, n>2 → squarer. */
export function superellipse(t, a, b, n = 2) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const e = 2 / n;
  return [Math.sign(c) * Math.pow(Math.abs(c), e) * a, Math.sign(s) * Math.pow(Math.abs(s), e) * b];
}

/**
 * Loft a stack of cross-sections along an axis polyline.
 *
 * @param {THREE.Vector3[]} axis   station centres
 * @param {Array} profiles         per-station { a, b, n, roll, offX, offY }
 *                                 a = half-width along the frame normal
 *                                 b = half-depth along the frame binormal
 * @param {number} radial          radial segment count
 */
export function loft(axis, profiles, radial = 24, opts = {}) {
  const { capStart = true, capEnd = true, refUp = new THREE.Vector3(0, 0, 1), uvV = null } = opts;
  const n = axis.length;
  const { normals, binormals } = transportFrames(axis, refUp);

  const verts = [];
  const norms = [];
  const uvs = [];
  const idx = [];

  const ring = radial + 1; // duplicate seam vertex for clean uvs

  for (let i = 0; i < n; i++) {
    const p = profiles[Math.min(i, profiles.length - 1)];
    const a = p.a;
    const b = p.b;
    const e = p.n ?? 2;
    const roll = p.roll ?? 0;
    const c = axis[i];
    const N = normals[i];
    const B = binormals[i];
    const cx = p.offX ?? 0;
    const cy = p.offY ?? 0;
    const vCoord = uvV ? uvV(i / (n - 1)) : i / (n - 1);

    for (let j = 0; j < ring; j++) {
      const t = (j / radial) * TAU + roll;
      const [su, sv] = superellipse(t, a, b, e);
      const x = su + cx;
      const y = sv + cy;
      verts.push(c.x + N.x * x + B.x * y, c.y + N.y * x + B.y * y, c.z + N.z * x + B.z * y);
      uvs.push(j / radial, vCoord);
      norms.push(0, 0, 0);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = i * ring + j;
      const b0 = a0 + 1;
      const a1 = (i + 1) * ring + j;
      const b1 = a1 + 1;
      idx.push(a0, a1, b1, a0, b1, b0);
    }
  }

  // caps as fans to the centroid
  const addCap = (i, flip) => {
    const base = verts.length / 3;
    const c = axis[i];
    verts.push(c.x, c.y, c.z);
    norms.push(0, 0, 0);
    uvs.push(0.5, 0.5);
    const rowStart = i * ring;
    for (let j = 0; j < radial; j++) {
      const p0 = rowStart + j;
      const p1 = rowStart + j + 1;
      if (flip) idx.push(base, p1, p0);
      else idx.push(base, p0, p1);
    }
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(n - 1, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Convenience: loft with a single radius function (circular sections). */
export function tube(axis, radiusFn, radial = 12, opts = {}) {
  const profiles = axis.map((_, i) => {
    const r = radiusFn(i / Math.max(1, axis.length - 1), i);
    return { a: r, b: r, n: 2 };
  });
  return loft(axis, profiles, radial, opts);
}

/** Sample a THREE.Curve into a point array. */
export function sample(curve, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(curve.getPoint(i / n));
  return out;
}

/** Catmull-Rom through control points. */
export function spline(pts, tension = 0.5) {
  return new THREE.CatmullRomCurve3(
    pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))),
    false,
    'catmullrom',
    tension
  );
}

/**
 * A double-sided ribbon following a path — the workhorse for fascial
 * planes and the long myofascial continuities.
 *
 * @param {THREE.Vector3[]} pts
 * @param {(t:number)=>number} widthFn   half-width in metres
 * @param {THREE.Vector3} refUp          controls which way the sheet faces
 */
export function ribbon(pts, widthFn, opts = {}) {
  const { refUp = new THREE.Vector3(0, 0, 1), twist = null, thickness = 0 } = opts;
  const n = pts.length;
  const { normals, binormals } = transportFrames(pts, refUp);
  const verts = [];
  const uvs = [];
  const idx = [];

  const push = (i, side, off) => {
    const t = i / (n - 1);
    const w = widthFn(t, i) * side;
    const N = normals[i];
    const B = binormals[i];
    const tw = twist ? twist(t) : 0;
    // rotate the width direction around the tangent by `tw`
    const dx = Math.cos(tw);
    const dy = Math.sin(tw);
    const p = pts[i];
    const ox = (N.x * dx + B.x * dy) * w + (B.x * dx - N.x * dy) * off;
    const oy = (N.y * dx + B.y * dy) * w + (B.y * dx - N.y * dy) * off;
    const oz = (N.z * dx + B.z * dy) * w + (B.z * dx - N.z * dy) * off;
    verts.push(p.x + ox, p.y + oy, p.z + oz);
    uvs.push((side + 1) / 2, t);
  };

  if (thickness > 0) {
    // four rails → a thin slab, so it catches light from both faces
    for (let i = 0; i < n; i++) {
      push(i, -1, thickness);
      push(i, 1, thickness);
      push(i, 1, -thickness);
      push(i, -1, -thickness);
    }
    const ring = 4;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < ring; j++) {
        const a0 = i * ring + j;
        const b0 = i * ring + ((j + 1) % ring);
        const a1 = (i + 1) * ring + j;
        const b1 = (i + 1) * ring + ((j + 1) % ring);
        idx.push(a0, a1, b1, a0, b1, b0);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      push(i, -1, 0);
      push(i, 1, 0);
    }
    for (let i = 0; i < n - 1; i++) {
      const a0 = i * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      idx.push(a0, a1, b1, a0, b1, b0);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Parametric sheet: fn(u, v, out) writes a world position. Used for
 * membranes (pleura, peritoneum, thoracolumbar fascia, diaphragm).
 */
export function sheet(fn, nu = 24, nv = 24) {
  const verts = [];
  const uvs = [];
  const idx = [];
  const out = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = i / nu;
      const v = j / nv;
      fn(u, v, out);
      verts.push(out.x, out.y, out.z);
      uvs.push(u, v);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Fusiform muscle belly along a path: thin at the tendinous ends,
 * thickest a little proximal of mid-belly.
 */
export function muscleBelly(pts, maxR, opts = {}) {
  const { peak = 0.45, tendon = 0.16, flat = 1, radial = 12, power = 1.6 } = opts;
  const profiles = pts.map((_, i) => {
    const t = i / Math.max(1, pts.length - 1);
    // asymmetric bell, tapering to a tendon at both ends
    const x = t < peak ? t / peak : (1 - t) / (1 - peak);
    const bell = Math.pow(clamp(x), 1 / power);
    const r = lerp(tendon, 1, bell) * maxR;
    return { a: r * flat, b: r / Math.sqrt(flat), n: 2.1 };
  });
  return loft(pts, profiles, radial, opts);
}

/** Ellipsoid, optionally squashed with a superellipse exponent. */
export function blob(rx, ry, rz, seg = 20, exp = 2) {
  const axis = [];
  const profiles = [];
  const stations = seg;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const ang = (t - 0.5) * Math.PI;
    const y = Math.sin(ang) * ry;
    const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y / ry), exp)), 1 / exp);
    axis.push(new THREE.Vector3(0, y, 0));
    profiles.push({ a: Math.max(1e-5, rx * k), b: Math.max(1e-5, rz * k), n: 2 });
  }
  return loft(axis, profiles, seg, { refUp: new THREE.Vector3(0, 0, 1), capStart: false, capEnd: false });
}

/** Merge with graceful failure (a null entry just gets skipped). */
export function merge(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  const g = mergeGeometries(ok, false);
  ok.forEach((x) => x.dispose());
  return g;
}

/** Translate / rotate / scale a geometry in place. */
export function place(g, { pos, rot, scale, mirrorX = false } = {}) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  const s = new THREE.Vector3(1, 1, 1);
  if (scale) {
    if (typeof scale === 'number') s.set(scale, scale, scale);
    else s.set(scale[0], scale[1], scale[2]);
  }
  if (mirrorX) s.x *= -1;
  m.compose(new THREE.Vector3(pos?.[0] || 0, pos?.[1] || 0, pos?.[2] || 0), q, s);
  g.applyMatrix4(m);
  if (mirrorX) {
    // flip winding so normals stay outward after the mirror
    const ix = g.getIndex();
    if (ix) {
      const arr = ix.array;
      for (let i = 0; i < arr.length; i += 3) {
        const t = arr[i];
        arr[i] = arr[i + 2];
        arr[i + 2] = t;
      }
      ix.needsUpdate = true;
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Add a per-vertex float attribute filled with a constant. */
export function stamp(g, name, value, itemSize = 1) {
  const count = g.getAttribute('position').count;
  const arr = new Float32Array(count * itemSize);
  if (itemSize === 1) arr.fill(value);
  else for (let i = 0; i < count; i++) for (let k = 0; k < itemSize; k++) arr[i * itemSize + k] = value[k];
  g.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  return g;
}

/** Recompute UVs so v runs along the axis and u around it (ribbons/tubes). */
export function axialUV(g) {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  if (!uv) return g;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const h = Math.max(1e-6, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - bb.min.y) / h);
  uv.needsUpdate = true;
  return g;
}
