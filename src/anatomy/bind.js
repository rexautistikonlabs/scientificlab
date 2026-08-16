/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Binding tissue geometry to the tension network.

   Every vertex of every tissue mesh is bound to its two nearest
   network nodes. At runtime the vertex shader reads those two
   entries out of the solved field texture, so one solve moves and
   colours the entire body. A uniform grid keeps the bind pass
   linear in vertex count, which is what makes load time short.
   ============================================================ */

import * as THREE from 'three';

export class NodeLocator {
  constructor(positions, count, cell = 0.07) {
    this.p = positions;
    this.n = count;
    this.cell = cell;
    this.grid = new Map();
    for (let i = 0; i < count; i++) {
      const k = this._key(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(i);
    }
  }

  _key(x, y, z) {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }

  /** Two nearest node indices plus the blend weight toward the first. */
  two(x, y, z, out) {
    const c = this.cell;
    const gx = Math.floor(x / c);
    const gy = Math.floor(y / c);
    const gz = Math.floor(z / c);
    let b0 = -1;
    let b1 = -1;
    let d0 = Infinity;
    let d1 = Infinity;

    // widen the search ring until two candidates are found
    for (let ring = 1; ring <= 6; ring++) {
      for (let ix = gx - ring; ix <= gx + ring; ix++) {
        for (let iy = gy - ring; iy <= gy + ring; iy++) {
          for (let iz = gz - ring; iz <= gz + ring; iz++) {
            // only walk the new shell
            if (
              ring > 1 &&
              Math.abs(ix - gx) < ring &&
              Math.abs(iy - gy) < ring &&
              Math.abs(iz - gz) < ring
            )
              continue;
            const arr = this.grid.get(`${ix},${iy},${iz}`);
            if (!arr) continue;
            for (let q = 0; q < arr.length; q++) {
              const i = arr[q];
              const dx = x - this.p[i * 3];
              const dy = y - this.p[i * 3 + 1];
              const dz = z - this.p[i * 3 + 2];
              const d = dx * dx + dy * dy + dz * dz;
              if (d < d0) {
                d1 = d0;
                b1 = b0;
                d0 = d;
                b0 = i;
              } else if (d < d1) {
                d1 = d;
                b1 = i;
              }
            }
          }
        }
      }
      if (b1 >= 0 && ring >= 2) break;
    }

    if (b0 < 0) {
      // degenerate fallback: brute force
      for (let i = 0; i < this.n; i++) {
        const dx = x - this.p[i * 3];
        const dy = y - this.p[i * 3 + 1];
        const dz = z - this.p[i * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d0) {
          d1 = d0;
          b1 = b0;
          d0 = d;
          b0 = i;
        } else if (d < d1) {
          d1 = d;
          b1 = i;
        }
      }
    }
    if (b1 < 0) b1 = b0;
    const r0 = Math.sqrt(d0);
    const r1 = Math.sqrt(Math.max(d1, d0));
    out[0] = b0;
    out[1] = b1;
    out[2] = r0 + r1 < 1e-9 ? 0.5 : r1 / (r0 + r1);
    return out;
  }

  nearest(x, y, z, tmp = [0, 0, 0]) {
    this.two(x, y, z, tmp);
    return tmp[0];
  }
}

const _tmp = [0, 0, 0];

/** Attach aNodeA / aNodeB / aNodeW to a geometry. */
export function bindGeometry(geom, locator) {
  const pos = geom.getAttribute('position');
  const n = pos.count;
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    locator.two(pos.getX(i), pos.getY(i), pos.getZ(i), _tmp);
    a[i] = _tmp[0];
    b[i] = _tmp[1];
    w[i] = _tmp[2];
  }
  geom.setAttribute('aNodeA', new THREE.BufferAttribute(a, 1));
  geom.setAttribute('aNodeB', new THREE.BufferAttribute(b, 1));
  geom.setAttribute('aNodeW', new THREE.BufferAttribute(w, 1));
  return geom;
}

/** Unique node indices a geometry is bound to — the intervention target set. */
export function nodesOf(geom) {
  const a = geom.getAttribute('aNodeA');
  const set = new Set();
  if (!a) return [];
  for (let i = 0; i < a.count; i++) set.add(a.getX(i));
  return [...set];
}
