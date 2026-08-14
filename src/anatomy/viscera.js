/* ============================================================
   Organs and viscera.

   Each organ is bound to the network node that suspends it, so its
   position is an outcome of tension rather than a fixed coordinate.
   Change diaphragmatic or mesenteric tension and the organ moves,
   and its interoceptive population reports the change.
   ============================================================ */

import * as THREE from 'three';
import { blob, loft, tube, spline, sample, merge, place } from './build.js';
import { lerp, TAU } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ORG = { color: 0xd4796a, opacity: 0.82, rough: 0.7, spec: 0.28, rim: 0.55 };

export function buildViscera(ctx) {
  const { add, mat, q } = ctx;
  const seg = q.high ? 26 : 18;

  /* ---------------- heart ---------------- */
  {
    const parts = [];
    // ventricular mass: a cone tilted down and to the subject's left
    const axis = [];
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const k = Math.sin((0.12 + t * 0.88) * Math.PI * 0.82);
      axis.push(V(-0.03 + t * 0.026, 1.31 - t * 0.072, 0.022 + t * 0.012));
      prof.push({ a: 0.036 * k + 0.004, b: 0.03 * k + 0.004, n: 2.2 });
    }
    parts.push(loft(axis, prof, seg, { capStart: false }));
    // atria
    parts.push(place(blob(0.026, 0.02, 0.022, 12), { pos: [-0.042, 1.318, 0.014] }));
    parts.push(place(blob(0.022, 0.018, 0.02, 12), { pos: [0.0, 1.322, 0.016] }));
    add({
      key: 'organ:heart',
      layer: 'organ',
      name: 'Heart',
      latin: 'cor',
      group: 'Thoracic viscera',
      region: 'thoracic',
      geometry: merge(parts),
      material: mat({ ...ORG, color: 0xd6444f, opacity: 0.9, rim: 0.7, wobble: 0.0005 }),
      center: V(-0.02, 1.28, 0.024),
      span: 0.16,
      physio: 'cardiac',
    });
  }

  /* ---------------- lungs ---------------- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const axis = [];
    const prof = [];
    const n = q.high ? 20 : 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = lerp(1.202, 1.438, t);
      // base broad and concave (diaphragm), apex narrow
      const shape = Math.sin(Math.min(1, 0.1 + t * 0.95) * Math.PI * 0.9);
      const bite = s > 0 ? 1 - 0.16 * Math.exp(-Math.pow((t - 0.35) / 0.3, 2)) : 1; // cardiac notch on the left
      axis.push(V(s * (0.056 + 0.016 * shape), y, 0.0 - 0.004 * t));
      prof.push({ a: (0.046 * shape + 0.01) * bite, b: 0.064 * shape + 0.014, n: 2.3 });
    }
    add({
      key: `organ:lung:${tag}`,
      layer: 'organ',
      name: `Lung · ${s > 0 ? 'left' : 'right'}`,
      latin: 'pulmo',
      group: 'Thoracic viscera',
      region: 'thoracic',
      side: s,
      geometry: loft(axis, prof, seg, { capStart: false, capEnd: false }),
      material: mat({ ...ORG, color: 0xd98a92, opacity: 0.42, rim: 0.9, mode: 'xray', doubleSide: true }),
      center: V(s * 0.07, 1.32, 0),
      span: 0.28,
      physio: 'lung',
      info: {
        note:
          'Volume change is produced by the chest wall and diaphragm, not by the lung itself. The pleural sliding surface is what makes that possible.',
      },
    });
  }

  /* ---------------- airway ---------------- */
  {
    const parts = [];
    const tr = sample(spline([V(0, 1.55, 0.014), V(0, 1.48, 0.008), V(0, 1.42, 0.0), V(0, 1.372, -0.004)]), 10);
    parts.push(tube(tr, () => 0.009, 10));
    for (const s of [1, -1]) {
      const br = sample(
        spline([V(0, 1.376, -0.004), V(s * 0.02, 1.358, -0.002), V(s * 0.042, 1.336, 0.0), V(s * 0.056, 1.318, 0.002)]),
        8
      );
      parts.push(tube(br, (t) => 0.0068 * (1 - 0.35 * t), 8));
      for (let k = 0; k < 3; k++) {
        const y0 = 1.318 - k * 0.006;
        const sub = sample(
          spline([
            V(s * 0.056, y0, 0.002),
            V(s * 0.066, y0 - 0.02 - k * 0.012, 0.006 + k * 0.004),
            V(s * 0.072, y0 - 0.045 - k * 0.022, 0.004),
          ]),
          6
        );
        parts.push(tube(sub, (t) => 0.0038 * (1 - 0.4 * t), 6));
      }
    }
    add({
      key: 'organ:airway',
      layer: 'organ',
      name: 'Trachea & bronchi',
      latin: 'trachea, bronchi',
      group: 'Thoracic viscera',
      region: 'thoracic',
      geometry: merge(parts),
      material: mat({ ...ORG, color: 0xc9b8a8, opacity: 0.7 }),
      center: V(0, 1.45, 0),
      span: 0.24,
      info: { note: 'Held open by cartilage rings and slung in the pretracheal layer of the deep cervical fascia.' },
    });
  }

  /* ---------------- abdominal viscera ---------------- */
  {
    // liver: large right-sided wedge under the diaphragm
    const liver = blob(0.078, 0.042, 0.055, seg, 2.6);
    place(liver, { pos: [-0.038, 1.184, 0.026], rot: [0.1, 0.24, -0.12], scale: [1.05, 0.9, 1] });
    add({
      key: 'organ:liver',
      layer: 'organ',
      name: 'Liver',
      latin: 'hepar',
      group: 'Abdominal viscera',
      region: 'abdominal',
      geometry: liver,
      material: mat({ ...ORG, color: 0x9d4b44, opacity: 0.86 }),
      center: V(-0.038, 1.184, 0.026),
      span: 0.2,
      physio: 'visceral',
      info: {
        note:
          'Suspended from the diaphragm by the coronary and triangular ligaments, so it rises and falls 2–3 cm with every breath. That excursion is a continuous mechanical stimulus to its capsule.',
      },
    });

    const stomach = blob(0.042, 0.036, 0.03, 14, 2.3);
    place(stomach, { pos: [0.042, 1.176, 0.03], rot: [0.1, -0.3, 0.35] });
    add({
      key: 'organ:stomach',
      layer: 'organ',
      name: 'Stomach',
      latin: 'gaster',
      group: 'Abdominal viscera',
      region: 'abdominal',
      geometry: stomach,
      material: mat({ ...ORG, color: 0xc9756a, opacity: 0.78 }),
      center: V(0.042, 1.176, 0.03),
      span: 0.16,
      physio: 'visceral',
    });

    add({
      key: 'organ:spleen',
      layer: 'organ',
      name: 'Spleen',
      latin: 'splen',
      group: 'Abdominal viscera',
      region: 'abdominal',
      side: 1,
      geometry: place(blob(0.022, 0.03, 0.018, 12), { pos: [0.094, 1.196, -0.012], rot: [0, 0, -0.3] }),
      material: mat({ ...ORG, color: 0x8d4a56, opacity: 0.82 }),
      center: V(0.094, 1.196, -0.012),
      span: 0.12,
      physio: 'visceral',
    });

    for (const s of [1, -1]) {
      const tag = s > 0 ? 'L' : 'R';
      add({
        key: `organ:kidney:${tag}`,
        layer: 'organ',
        name: `Kidney · ${s > 0 ? 'left' : 'right'}`,
        latin: 'ren',
        group: 'Abdominal viscera',
        region: 'abdominal',
        side: s,
        geometry: place(blob(0.017, 0.03, 0.015, 12, 2.4), {
          pos: [s * 0.056, s > 0 ? 1.132 : 1.122, -0.03],
          rot: [0, 0, s * 0.12],
        }),
        material: mat({ ...ORG, color: 0x9c5548, opacity: 0.84 }),
        center: V(s * 0.056, 1.128, -0.03),
        span: 0.12,
        physio: 'visceral',
        info: {
          note:
            'Retroperitoneal, lying on the psoas inside a fat and fascial envelope. It descends with inspiration, so its mobility depends on both diaphragm and psoas tension.',
        },
      });
    }

    // small intestine: a coiled tube, procedurally packed into the central abdomen
    {
      const pts = [];
      const turns = 5.4;
      const n = q.high ? 200 : 130;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * TAU * turns;
        const rr = 0.052 * (1 - 0.28 * Math.cos(t * Math.PI * 2.0)) * (0.55 + 0.45 * Math.sin(t * Math.PI));
        pts.push(
          V(
            Math.cos(a) * rr * 1.1,
            1.13 - t * 0.15 + Math.sin(a * 1.6) * 0.008,
            0.026 + Math.sin(a) * rr * 0.62 + Math.cos(t * 9.0) * 0.006
          )
        );
      }
      add({
        key: 'organ:smallInt',
        layer: 'organ',
        name: 'Small intestine',
        latin: 'intestinum tenue',
        group: 'Abdominal viscera',
        region: 'abdominal',
        geometry: tube(pts, () => 0.0135, 7),
        material: mat({ ...ORG, color: 0xd08a72, opacity: 0.8, wobble: 0.0006 }),
        center: V(0, 1.05, 0.026),
        span: 0.22,
        physio: 'visceral',
      });
    }

    // large intestine: the ascending–transverse–descending frame
    {
      const pts = sample(
        spline([
          V(-0.078, 0.98, 0.03),
          V(-0.084, 1.05, 0.028),
          V(-0.08, 1.13, 0.024),
          V(-0.05, 1.16, 0.03),
          V(0, 1.155, 0.036),
          V(0.05, 1.16, 0.03),
          V(0.082, 1.13, 0.022),
          V(0.086, 1.05, 0.024),
          V(0.072, 0.985, 0.026),
          V(0.03, 0.955, 0.014),
          V(0.0, 0.945, -0.006),
        ]),
        q.high ? 80 : 54
      );
      add({
        key: 'organ:colon',
        layer: 'organ',
        name: 'Large intestine',
        latin: 'intestinum crassum',
        group: 'Abdominal viscera',
        region: 'abdominal',
        geometry: tube(pts, (t) => 0.019 - 0.005 * t, 8),
        material: mat({ ...ORG, color: 0xc98a68, opacity: 0.78, wobble: 0.0005 }),
        center: V(0, 1.06, 0.02),
        span: 0.26,
        physio: 'visceral',
      });
    }

    add({
      key: 'organ:bladder',
      layer: 'organ',
      name: 'Urinary bladder',
      latin: 'vesica urinaria',
      group: 'Pelvic viscera',
      region: 'pelvic',
      geometry: place(blob(0.03, 0.024, 0.026, 12), { pos: [0, 0.948, 0.034] }),
      material: mat({ ...ORG, color: 0xc9a06a, opacity: 0.72 }),
      center: V(0, 0.948, 0.034),
      span: 0.12,
      physio: 'visceral',
      info: {
        note:
          'Wall tension, not volume, is what its afferents report — which is why the same volume feels different under different pelvic-floor tone.',
      },
    });

    // pelvic floor
    {
      const g = new THREE.BufferGeometry();
      const verts = [];
      const uvs = [];
      const idx = [];
      const nu = 16;
      const nv = 8;
      for (let i = 0; i <= nu; i++) {
        const a = (i / nu) * TAU;
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          const r = lerp(0.062, 0.006, v);
          verts.push(Math.sin(a) * r * 0.92, 0.906 - (1 - v) * 0.0 - v * 0.016, Math.cos(a) * r + 0.002);
          uvs.push(i / nu, v);
        }
      }
      const row = nv + 1;
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const p = i * row + j;
          idx.push(p, p + row, p + row + 1, p, p + row + 1, p + 1);
        }
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      add({
        key: 'muscle:pelvicFloor',
        layer: 'muscle',
        name: 'Pelvic floor',
        latin: 'diaphragma pelvis',
        group: 'Deep front',
        region: 'pelvic',
        geometry: g,
        material: mat({ color: 0xbf5a63, opacity: 0.7, rough: 0.65, spec: 0.2, rim: 0.7, doubleSide: true, mode: 'xray' }),
        center: V(0, 0.9, 0),
        span: 0.18,
        info: {
          note:
            'The caudal end of the deep front line and the lower wall of the abdominal pressure vessel. It moves with every breath, in antiphase to the diaphragm.',
          receptors: ['ruffini', 'free', 'intero', 'spindle'],
        },
      });
    }
  }
}
