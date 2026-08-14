/* ============================================================
   Fluid systems: arterial, venous, lymphatic.

   Modelled as three trees whose shaders carry travelling pressure
   waves. Arterial pulse is a mechanical stimulus in its own right;
   the venous and lymphatic sides are the compliant channels that
   external compression closes first, so they respond visibly to
   applied load.
   ============================================================ */

import * as THREE from 'three';
import { tube, spline, sample, merge, blob, place } from './build.js';
import { VERTEBRAE } from './landmarks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ART = { color: 0xe8506b, opacity: 0.82, flow: 1.0, wave: 0.55, rim: 0.5 };
const VEIN = { color: 0x5b83d6, opacity: 0.72, flow: 0.4, wave: 0.16, rim: 0.55 };
const LYM = { color: 0x9fe86b, opacity: 0.62, flow: 0.12, wave: 0.08, rim: 0.7 };

export function buildVascular(ctx) {
  const { add, mat, q } = ctx;
  const N = q.high ? 1 : 0.7;
  const seg = (n) => Math.max(6, Math.round(n * N));

  /* ============================================================
     Arterial tree
     ============================================================ */
  {
    // aortic root, arch and descending aorta
    const aorta = sample(
      spline([
        V(-0.012, 1.29, 0.016),
        V(-0.006, 1.35, 0.014),
        V(0.004, 1.386, -0.002),
        V(0.004, 1.372, -0.024),
        V(0.0, 1.32, -0.03),
        V(0.0, 1.24, -0.026),
        V(0.0, 1.16, -0.022),
        V(0.0, 1.08, -0.02),
        V(0.0, 1.0, -0.024),
      ]),
      seg(34)
    );
    add({
      key: 'artery:aorta',
      layer: 'arterial',
      name: 'Aorta',
      latin: 'aorta',
      group: 'Great vessels',
      region: 'axial',
      geometry: tube(aorta, (t) => 0.0135 - 0.004 * t, 10),
      material: mat({ ...ART, ...{ vessel: true }, opacity: 0.86 }),
      center: V(0, 1.2, -0.02),
      span: 0.5,
      info: {
        note:
          'Its elastic wall stores each stroke and releases it during diastole. That windkessel action is what turns a pulsatile pump into steady capillary flow.',
      },
    });

    const branches = [
      {
        id: 'carotid',
        name: 'Common carotid & vertebral arteries',
        latin: 'a. carotis communis, a. vertebralis',
        group: 'Head & neck',
        region: 'cervical',
        bilateral: true,
        r: 0.005,
        path: (s) => [
          V(s * 0.01, 1.382, -0.008),
          V(s * 0.024, 1.43, 0.004),
          V(s * 0.03, 1.49, 0.008),
          V(s * 0.032, 1.55, 0.0),
          V(s * 0.03, 1.6, -0.014),
        ],
        note:
          'Runs inside the carotid sheath, a compartment of the deep cervical fascia shared with the vagus and the internal jugular vein — mechanics here touch all three at once.',
      },
      {
        id: 'subclavian',
        name: 'Subclavian & brachial arteries',
        latin: 'a. subclavia, a. brachialis',
        group: 'Upper limb',
        region: 'upperLimb',
        bilateral: true,
        r: 0.0044,
        path: (s) => [
          V(s * 0.014, 1.386, -0.006),
          V(s * 0.06, 1.408, 0.006),
          V(s * 0.12, 1.402, 0.012),
          V(s * 0.166, 1.386, 0.008),
          V(s * 0.196, 1.27, 0.004),
          V(s * 0.224, 1.1, 0.0),
          V(s * 0.248, 0.95, 0.012),
          V(s * 0.262, 0.848, 0.02),
        ],
        note: 'Passes through the costoclavicular space with the plexus; a classic site where posture changes the mechanical environment of a vessel.',
      },
      {
        id: 'iliacFemoral',
        name: 'Iliac & femoral arteries',
        latin: 'a. iliaca, a. femoralis',
        group: 'Lower limb',
        region: 'lowerLimb',
        bilateral: true,
        r: 0.0062,
        path: (s) => [
          V(s * 0.004, 1.0, -0.024),
          V(s * 0.03, 0.98, -0.006),
          V(s * 0.056, 0.955, 0.024),
          V(s * 0.072, 0.9, 0.032),
          V(s * 0.07, 0.76, 0.028),
          V(s * 0.064, 0.6, 0.016),
          V(s * 0.06, 0.5, -0.006),
          V(s * 0.056, 0.34, -0.014),
          V(s * 0.052, 0.14, -0.012),
          V(s * 0.052, 0.06, 0.0),
        ],
      },
      {
        id: 'renal',
        name: 'Renal & mesenteric arteries',
        latin: 'a. renalis, a. mesenterica',
        group: 'Visceral',
        region: 'abdominal',
        bilateral: true,
        r: 0.0034,
        path: (s) => [
          V(0.0, 1.13, -0.022),
          V(s * 0.03, 1.128, -0.026),
          V(s * 0.05, 1.128, -0.03),
        ],
      },
      {
        id: 'intercostalArt',
        name: 'Intercostal arteries',
        latin: 'aa. intercostales',
        group: 'Thoracic',
        region: 'thoracic',
        bilateral: true,
        r: 0.0016,
        custom: 'intercostal',
      },
      {
        id: 'pulmonary',
        name: 'Pulmonary arteries',
        latin: 'a. pulmonalis',
        group: 'Great vessels',
        region: 'thoracic',
        bilateral: true,
        r: 0.0068,
        path: (s) => [V(-0.008, 1.318, 0.014), V(s * 0.024, 1.33, 0.006), V(s * 0.05, 1.322, 0.0), V(s * 0.064, 1.31, -0.002)],
        note: 'A low-pressure circuit: roughly a fifth of systemic pressure, so its wall is thin and its pulse wave slow.',
      },
    ];

    for (const b of branches) {
      for (const s of b.bilateral ? [1, -1] : [0]) {
        const tag = s === 0 ? '' : s > 0 ? ':L' : ':R';
        let geom;
        let center;
        if (b.custom === 'intercostal') {
          const parts = [];
          for (const sg of [1, -1]) {
            for (let i = 0; i < 10; i++) {
              const vt = VERTEBRAE.find((v) => v.label === `T${i + 2}`);
              if (!vt) continue;
              const p = sample(
                spline([
                  V(sg * 0.008, vt.pos.y, vt.pos.z + 0.004),
                  V(sg * 0.06, vt.pos.y - 0.014, vt.pos.z - 0.014),
                  V(sg * 0.112, vt.pos.y - 0.03, 0.016),
                  V(sg * 0.05, vt.pos.y - 0.048, 0.056),
                ]),
                10
              );
              parts.push(tube(p, () => b.r, 4));
            }
          }
          geom = merge(parts);
          center = V(0, 1.28, 0.01);
          if (s < 0) continue; // built for both sides in one pass
        } else {
          const pts = sample(spline(b.path(s || 1)), seg(24));
          geom = tube(pts, (t) => b.r * (1 - 0.4 * t), 8);
          center = pts[Math.floor(pts.length / 2)].clone();
        }
        add({
          key: `artery:${b.id}${tag}`,
          layer: 'arterial',
          name: s === 0 || b.custom ? b.name : `${b.name} · ${s > 0 ? 'left' : 'right'}`,
          latin: b.latin,
          group: b.group,
          region: b.region,
          side: b.custom ? 0 : s,
          geometry: geom,
          material: mat({ ...ART, vessel: true }),
          center,
          span: 0.4,
          info: { note: b.note },
        });
      }
    }
  }

  /* ============================================================
     Venous return
     ============================================================ */
  {
    const cava = sample(
      spline([
        V(0.02, 0.99, -0.008),
        V(0.018, 1.06, 0.0),
        V(0.016, 1.14, 0.004),
        V(0.014, 1.2, 0.008),
        V(0.006, 1.27, 0.012),
        V(-0.004, 1.31, 0.014),
      ]),
      seg(24)
    );
    add({
      key: 'vein:cavaInferior',
      layer: 'venous',
      name: 'Inferior vena cava',
      latin: 'v. cava inferior',
      group: 'Great vessels',
      region: 'axial',
      geometry: tube(cava, (t) => 0.011 + 0.003 * t, 10),
      material: mat({ ...VEIN, vessel: true, opacity: 0.78 }),
      center: V(0.012, 1.14, 0.004),
      span: 0.4,
      info: {
        note:
          'It passes through the diaphragm, so every inspiration squeezes it and assists return. Breathing is part of the circulation, not separate from it.',
      },
    });

    const veins = [
      {
        id: 'jugular',
        name: 'Internal jugular vein',
        latin: 'v. jugularis interna',
        group: 'Head & neck',
        region: 'cervical',
        r: 0.0062,
        path: (s) => [V(s * 0.02, 1.38, 0.0), V(s * 0.034, 1.44, 0.008), V(s * 0.042, 1.51, 0.008), V(s * 0.044, 1.57, -0.004)],
      },
      {
        id: 'subclavianVein',
        name: 'Subclavian & brachial veins',
        latin: 'v. subclavia, v. brachialis',
        group: 'Upper limb',
        region: 'upperLimb',
        r: 0.005,
        path: (s) => [
          V(s * 0.018, 1.382, 0.002),
          V(s * 0.07, 1.402, 0.014),
          V(s * 0.13, 1.398, 0.016),
          V(s * 0.172, 1.382, 0.014),
          V(s * 0.2, 1.26, 0.008),
          V(s * 0.228, 1.1, 0.006),
          V(s * 0.252, 0.94, 0.018),
          V(s * 0.264, 0.846, 0.026),
        ],
      },
      {
        id: 'femoralVein',
        name: 'Femoral & popliteal veins',
        latin: 'v. femoralis, v. poplitea',
        group: 'Lower limb',
        region: 'lowerLimb',
        r: 0.0068,
        path: (s) => [
          V(s * 0.014, 0.99, -0.014),
          V(s * 0.042, 0.965, 0.014),
          V(s * 0.064, 0.92, 0.03),
          V(s * 0.066, 0.78, 0.026),
          V(s * 0.062, 0.62, 0.008),
          V(s * 0.062, 0.5, -0.016),
          V(s * 0.058, 0.32, -0.022),
          V(s * 0.054, 0.12, -0.018),
          V(s * 0.052, 0.05, -0.004),
        ],
        note:
          'Valved and highly compliant. It depends on the calf muscle pump and on the fascial compartment staying tight — a mechanical, not a cardiac, mechanism.',
      },
      {
        id: 'portal',
        name: 'Portal vein',
        latin: 'v. portae',
        group: 'Visceral',
        region: 'abdominal',
        r: 0.0056,
        path: (s) => [V(0.0, 1.09, 0.014), V(-0.014, 1.14, 0.016), V(-0.03, 1.174, 0.02)],
        single: true,
      },
    ];

    for (const b of veins) {
      for (const s of b.single ? [0] : [1, -1]) {
        const tag = s === 0 ? '' : s > 0 ? ':L' : ':R';
        const pts = sample(spline(b.path(s || 1)), seg(22));
        add({
          key: `vein:${b.id}${tag}`,
          layer: 'venous',
          name: s === 0 ? b.name : `${b.name} · ${s > 0 ? 'left' : 'right'}`,
          latin: b.latin,
          group: b.group,
          region: b.region,
          side: s,
          geometry: tube(pts, (t) => b.r * (1 - 0.35 * t), 8),
          material: mat({ ...VEIN, vessel: true }),
          center: pts[Math.floor(pts.length / 2)].clone(),
          span: 0.4,
          info: { note: b.note },
        });
      }
    }
  }

  /* ============================================================
     Lymphatic system
     ============================================================ */
  {
    const duct = sample(
      spline([
        V(0.006, 1.06, -0.03),
        V(0.008, 1.12, -0.028),
        V(0.01, 1.2, -0.026),
        V(0.01, 1.28, -0.024),
        V(0.012, 1.35, -0.018),
        V(0.016, 1.39, -0.008),
      ]),
      seg(22)
    );
    add({
      key: 'lymph:thoracicDuct',
      layer: 'lymph',
      name: 'Thoracic duct & cisterna chyli',
      latin: 'ductus thoracicus, cisterna chyli',
      group: 'Lymphatic trunks',
      region: 'axial',
      geometry: merge([tube(duct, () => 0.0032, 8), place(blob(0.008, 0.014, 0.007, 10), { pos: [0.006, 1.055, -0.03] })]),
      material: mat({ ...LYM, vessel: true, opacity: 0.72 }),
      center: V(0.01, 1.2, -0.026),
      span: 0.4,
      info: {
        note:
          'Drains most of the body into the venous system at the root of the neck. It has no central pump: transit depends on respiratory pressure swings, arterial pulsation and tissue movement.',
      },
    });

    // regional chains and nodes
    const chains = [
      { id: 'cervicalNodes', name: 'Cervical lymph chain', region: 'cervical', pts: (s) => [V(s * 0.036, 1.42, 0.01), V(s * 0.042, 1.48, 0.012), V(s * 0.046, 1.54, 0.0)] },
      { id: 'axillaryNodes', name: 'Axillary lymph chain', region: 'upperLimb', pts: (s) => [V(s * 0.11, 1.37, 0.01), V(s * 0.14, 1.34, 0.004), V(s * 0.166, 1.3, -0.002)] },
      { id: 'inguinalNodes', name: 'Inguinal lymph chain', region: 'pelvic', pts: (s) => [V(s * 0.05, 0.99, 0.05), V(s * 0.07, 0.955, 0.044), V(s * 0.082, 0.92, 0.03)] },
      { id: 'mesentericNodes', name: 'Mesenteric lymph chain', region: 'abdominal', pts: (s) => [V(s * 0.02, 1.09, -0.006), V(s * 0.03, 1.06, 0.006), V(s * 0.036, 1.02, 0.012)] },
      { id: 'legLymph', name: 'Lower-limb lymphatics', region: 'lowerLimb', pts: (s) => [V(s * 0.056, 0.08, 0.0), V(s * 0.06, 0.3, 0.02), V(s * 0.066, 0.55, 0.03), V(s * 0.078, 0.85, 0.04), V(s * 0.082, 0.92, 0.032)] },
      { id: 'armLymph', name: 'Upper-limb lymphatics', region: 'upperLimb', pts: (s) => [V(s * 0.266, 0.85, 0.024), V(s * 0.246, 0.98, 0.014), V(s * 0.216, 1.14, 0.008), V(s * 0.18, 1.32, 0.006)] },
    ];
    for (const c of chains) {
      for (const s of [1, -1]) {
        const tag = s > 0 ? 'L' : 'R';
        const pts = sample(spline(c.pts(s)), seg(16));
        const parts = [tube(pts, () => 0.0022, 6)];
        for (let k = 0; k < pts.length; k += Math.max(2, Math.floor(pts.length / 4))) {
          parts.push(place(blob(0.0055, 0.0075, 0.005, 8), { pos: [pts[k].x, pts[k].y, pts[k].z] }));
        }
        add({
          key: `lymph:${c.id}:${tag}`,
          layer: 'lymph',
          name: `${c.name} · ${s > 0 ? 'left' : 'right'}`,
          latin: 'nodi lymphoidei',
          group: 'Lymphatic chains',
          region: c.region,
          side: s,
          geometry: merge(parts),
          material: mat({ ...LYM, vessel: true }),
          center: pts[Math.floor(pts.length / 2)].clone(),
          span: 0.3,
        });
      }
    }

    // interstitial field: a diffuse cloud showing where fluid sits between the cells
    {
      const parts = [];
      const grid = [
        [0, 1.1, 0.06],
        [0, 1.28, 0.05],
        [0, 1.0, -0.05],
        [0.1, 1.2, 0.0],
        [-0.1, 1.2, 0.0],
        [0.07, 0.7, 0.0],
        [-0.07, 0.7, 0.0],
        [0.24, 1.05, 0.0],
        [-0.24, 1.05, 0.0],
      ];
      for (const g of grid) parts.push(place(blob(0.04, 0.07, 0.035, 8), { pos: g }));
      add({
        key: 'lymph:interstitium',
        layer: 'lymph',
        name: 'Interstitial compartment',
        latin: 'spatium interstitiale',
        group: 'Interstitium',
        region: 'multi',
        geometry: merge(parts),
        material: mat({ ...LYM, vessel: true, color: 0xbaf08a, opacity: 0.1, wave: 0.3 }),
        center: V(0, 1.1, 0),
        span: 0.9,
        opacityFactor: 0.5,
        info: {
          note:
            'Most of the body’s water is here, in the fascial matrix rather than in vessels. Its pressure gradient is set by the surrounding tension, which is why mechanical state and fluid state cannot be separated.',
        },
      });
    }
  }
}
