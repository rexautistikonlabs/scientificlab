/* ============================================================
   Fascia — the continuous tension network made visible.

   Four registers, each its own layer so they can be studied
   separately or stacked:
     superficial  loose, fluid-rich, the gliding sheet under skin
     deep         dense investing sheets, septa, aponeuroses
     continuities the long myofascial tracks (own layer: `chains`)
     visceral     serous membranes and mesenteries suspending organs
   ============================================================ */

import * as THREE from 'three';
import { loft, ribbon, sheet, spline, sample, merge } from './build.js';
import { trunkAxis, trunkSurface, vertebra } from './landmarks.js';
import { chainInstances } from './chains.js';
import { lerp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const SUP = { color: 0x79e6cf, opacity: 0.2, rough: 0.8, spec: 0.1, rim: 0.9, mode: 'xray', doubleSide: true };
const DEEP = { color: 0x4fd6e0, opacity: 0.5, rough: 0.55, spec: 0.3, rim: 0.85, mode: 'xray', doubleSide: true, stripe: 0.3, stripeFreq: 220 };
const VISC = { color: 0x78c0ff, opacity: 0.34, rough: 0.7, spec: 0.2, rim: 1.0, mode: 'xray', doubleSide: true };

export function buildFascia(ctx) {
  const { add, mat, q } = ctx;

  /* ============================================================
     Superficial fascia — a single offset shell over the trunk plus
     sleeves down each limb
     ============================================================ */
  {
    const axis = trunkAxis(0.79, 1.742, q.high ? 34 : 22);
    const pts = axis.map((a) => a.pos);
    const prof = axis.map((a) => ({
      a: a.sec.a - 0.006,
      b: a.sec.b - 0.006,
      n: a.sec.n,
    }));
    add({
      key: 'fascia:superficialTrunk',
      layer: 'fasciaSup',
      name: 'Superficial fascia · trunk',
      latin: 'fascia superficialis',
      group: 'Superficial fascia',
      region: 'trunk',
      geometry: loft(pts, prof, q.high ? 34 : 24, { capStart: false, capEnd: false }),
      material: mat(SUP),
      center: V(0, 1.2, 0),
      span: 0.9,
      info: {
        note:
          'A honeycomb of loose connective tissue holding most of the body’s interstitial fluid. It is what allows skin to shear over deep tissue, and the first layer any external contact loads.',
      },
    });

    for (const s of [1, -1]) {
      const tag = s > 0 ? 'L' : 'R';
      add({
        key: `fascia:superficialLeg:${tag}`,
        layer: 'fasciaSup',
        name: `Superficial fascia · ${s > 0 ? 'left' : 'right'} lower limb`,
        latin: 'fascia superficialis',
        group: 'Superficial fascia',
        region: 'lowerLimb',
        side: s,
        geometry: limbSleeve(legStations(s), -0.005, q),
        material: mat(SUP),
        center: V(s * 0.07, 0.5, 0),
        span: 0.9,
      });
      add({
        key: `fascia:superficialArm:${tag}`,
        layer: 'fasciaSup',
        name: `Superficial fascia · ${s > 0 ? 'left' : 'right'} upper limb`,
        latin: 'fascia superficialis',
        group: 'Superficial fascia',
        region: 'upperLimb',
        side: s,
        geometry: limbSleeve(armStations(s), -0.004, q),
        material: mat(SUP),
        center: V(s * 0.22, 1.1, 0),
        span: 0.7,
      });
    }
  }

  /* ============================================================
     Deep fascia — investing sheets, aponeuroses and septa
     ============================================================ */

  // Thoracolumbar fascia: the diamond where four force paths converge
  {
    const g = sheet(
      (u, v, out) => {
        // u: left → right, v: caudal (sacrum) → cranial (T12)
        const x = (u - 0.5) * 2;
        const y = lerp(0.94, 1.2, v);
        // diamond taper: widest at the crest, narrowing at both ends
        const w = 0.13 * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.86) + 0.035;
        const sp = vertebra(v < 0.45 ? 'S1' : v < 0.75 ? 'L3' : 'T12').pos;
        const z = sp.z - 0.036 - (1 - Math.abs(x)) * 0.014 + Math.abs(x) * 0.02;
        out.set(x * w, y, z);
      },
      q.high ? 22 : 15,
      q.high ? 20 : 13
    );
    add({
      key: 'fascia:thoracolumbar',
      layer: 'fasciaDeep',
      name: 'Thoracolumbar fascia',
      latin: 'fascia thoracolumbalis',
      group: 'Aponeuroses',
      region: 'lumbar',
      geometry: g,
      material: mat({ ...DEEP, opacity: 0.56, color: 0x54dfe6 }),
      center: V(0, 1.07, -0.06),
      span: 0.36,
    });
  }

  // Nuchal fascia
  {
    const g = sheet(
      (u, v, out) => {
        const x = (u - 0.5) * 2;
        const y = lerp(1.42, 1.63, v);
        const w = 0.048 + 0.026 * Math.sin(v * Math.PI);
        out.set(x * w, y, -0.052 - Math.abs(x) * 0.012 - v * 0.012);
      },
      12,
      12
    );
    add({
      key: 'fascia:nuchal',
      layer: 'fasciaDeep',
      name: 'Nuchal fascia',
      latin: 'fascia nuchae',
      group: 'Aponeuroses',
      region: 'cervical',
      geometry: g,
      material: mat({ ...DEEP, opacity: 0.5 }),
      center: V(0, 1.52, -0.056),
      span: 0.22,
    });
  }

  // Deep cervical fascia: three concentric sleeves
  {
    const parts = [];
    for (const [rOut, rIn] of [
      [0.055, 0.05],
      [0.036, 0.032],
      [0.024, 0.021],
    ]) {
      const axis = [];
      const prof = [];
      for (let i = 0; i <= 10; i++) {
        const y = lerp(1.42, 1.575, i / 10);
        const k = 1 - 0.12 * Math.sin((i / 10) * Math.PI);
        axis.push(V(0, y, -0.008 + 0.004 * (i / 10)));
        prof.push({ a: rOut * k, b: rOut * 0.92 * k, n: 2.1 });
      }
      parts.push(loft(axis, prof, 18, { capStart: false, capEnd: false }));
    }
    add({
      key: 'fascia:cervicalDeep',
      layer: 'fasciaDeep',
      name: 'Deep cervical fascia',
      latin: 'fascia cervicalis profunda',
      group: 'Investing sheets',
      region: 'cervical',
      geometry: merge(parts),
      material: mat({ ...DEEP, opacity: 0.42, color: 0x62e0e8 }),
      center: V(0, 1.5, -0.006),
      span: 0.24,
    });
  }

  // Investing sheets over the limbs (fascia lata, crural, brachial, antebrachial)
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    add({
      key: `fascia:lata:${tag}`,
      layer: 'fasciaDeep',
      name: `Fascia lata & crural fascia · ${s > 0 ? 'left' : 'right'}`,
      latin: 'fascia lata, fascia cruris',
      group: 'Investing sheets',
      region: 'lowerLimb',
      side: s,
      geometry: limbSleeve(legStations(s), 0.006, q),
      material: mat({ ...DEEP, opacity: 0.4 }),
      center: V(s * 0.07, 0.55, 0),
      span: 0.9,
      info: {
        note:
          'Thick enough laterally to act as a tension band along the whole thigh. Its iliotibial portion carries load from the hip to below the knee without any muscle in series.',
      },
    });
    add({
      key: `fascia:brachial:${tag}`,
      layer: 'fasciaDeep',
      name: `Brachial & antebrachial fascia · ${s > 0 ? 'left' : 'right'}`,
      latin: 'fascia brachii, fascia antebrachii',
      group: 'Investing sheets',
      region: 'upperLimb',
      side: s,
      geometry: limbSleeve(armStations(s), 0.005, q),
      material: mat({ ...DEEP, opacity: 0.38 }),
      center: V(s * 0.22, 1.1, 0),
      span: 0.7,
    });

    // plantar fascia — the caudal anchor of the posterior line
    const pf = [
      V(s * 0.05, 0.026, -0.05),
      V(s * 0.052, 0.016, -0.01),
      V(s * 0.054, 0.011, 0.04),
      V(s * 0.056, 0.012, 0.09),
      V(s * 0.058, 0.014, 0.116),
    ];
    add({
      key: `fascia:plantar:${tag}`,
      layer: 'fasciaDeep',
      name: `Plantar fascia · ${s > 0 ? 'left' : 'right'}`,
      latin: 'aponeurosis plantaris',
      group: 'Aponeuroses',
      region: 'lowerLimb',
      side: s,
      geometry: ribbon(pf, (t) => 0.016 + 0.014 * t, { refUp: V(0, 1, 0), thickness: 0.0016 }),
      material: mat({ ...DEEP, opacity: 0.72, color: 0x6ce0d8 }),
      center: V(s * 0.054, 0.02, 0.03),
      span: 0.2,
    });

    // retinacula — small, dense, Ruffini-rich bands
    for (const [y, name, r] of [
      [0.088, 'Ankle retinacula', 0.03],
      [0.845, 'Wrist retinacula', 0.026],
    ]) {
      const isAnkle = y < 0.5;
      const cx = isAnkle ? s * 0.052 : s * 0.262;
      const axis = [V(cx, y - 0.012, isAnkle ? -0.004 : 0.012), V(cx, y + 0.012, isAnkle ? -0.004 : 0.016)];
      add({
        key: `fascia:retinaculum:${isAnkle ? 'ankle' : 'wrist'}:${tag}`,
        layer: 'fasciaDeep',
        name: `${name} · ${s > 0 ? 'left' : 'right'}`,
        latin: 'retinacula',
        group: 'Retinacula',
        region: isAnkle ? 'lowerLimb' : 'upperLimb',
        side: s,
        geometry: loft(
          axis,
          axis.map(() => ({ a: r, b: r * 0.8, n: 2.4 })),
          16,
          { capStart: false, capEnd: false }
        ),
        material: mat({ ...DEEP, opacity: 0.66, color: 0x8ef0d0 }),
        center: V(cx, y, 0),
        span: 0.1,
        info: {
          note:
            'A dense transverse band holding long tendons to bone. Retinacula are among the most densely innervated fascial structures known, and they report joint position independently of the muscles they restrain.',
        },
      });
    }
  }

  // Abdominal aponeurosis / linea alba
  {
    const g = sheet(
      (u, v, out) => {
        const y = lerp(0.94, 1.23, v);
        const th = (u - 0.5) * Math.PI * 1.5;
        out.copy(trunkSurface(y, th, 0.02));
        out.z -= 0.002 * Math.cos(th);
      },
      q.high ? 24 : 16,
      q.high ? 18 : 12
    );
    add({
      key: 'fascia:abdominalAponeurosis',
      layer: 'fasciaDeep',
      name: 'Abdominal aponeurosis',
      latin: 'aponeurosis m. abdominis, linea alba',
      group: 'Aponeuroses',
      region: 'abdominal',
      geometry: g,
      material: mat({ ...DEEP, opacity: 0.34 }),
      center: V(0, 1.08, 0.06),
      span: 0.36,
      info: {
        note:
          'Cross-ply layers meeting at the midline. It converts abdominal muscle tension into hoop stress, which is how intra-abdominal pressure becomes a spinal stabiliser.',
      },
    });
  }

  // Pericardium / mediastinum — the fascial column of the deep front line
  {
    const parts = [];
    const axis = [];
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = lerp(1.19, 1.44, t);
      const r = lerp(0.062, 0.026, Math.pow(t, 0.8));
      axis.push(V(-0.008 * (1 - t), y, 0.022 - 0.02 * t));
      prof.push({ a: r, b: r * 0.86, n: 2.1 });
    }
    parts.push(loft(axis, prof, 20, { capStart: false, capEnd: false }));
    add({
      key: 'fascia:mediastinum',
      layer: 'fasciaVisc',
      name: 'Pericardium & mediastinal fascia',
      latin: 'pericardium, fascia mediastinalis',
      group: 'Visceral membranes',
      region: 'thoracic',
      geometry: merge(parts),
      material: mat({ ...VISC, opacity: 0.4 }),
      center: V(0, 1.3, 0.01),
      span: 0.3,
      info: {
        note:
          'Continuous downward with the diaphragm and upward with the deep cervical fascia. This is the mechanical corridor by which cervical tension and breathing both reach the heart.',
      },
    });
  }

  // Pleura
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const axis = [];
    const prof = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const y = lerp(1.2, 1.44, t);
      const shape = Math.sin(Math.min(1, 0.15 + t * 0.95) * Math.PI * 0.86);
      axis.push(V(s * (0.058 + 0.014 * shape), y, 0.002));
      prof.push({ a: 0.05 * shape + 0.012, b: 0.068 * shape + 0.016, n: 2.2 });
    }
    add({
      key: `fascia:pleura:${tag}`,
      layer: 'fasciaVisc',
      name: `Pleura · ${s > 0 ? 'left' : 'right'}`,
      latin: 'pleura',
      group: 'Visceral membranes',
      region: 'thoracic',
      side: s,
      geometry: loft(axis, prof, 18, { capStart: false, capEnd: false }),
      material: mat({ ...VISC, opacity: 0.26 }),
      center: V(s * 0.07, 1.32, 0),
      span: 0.3,
      info: {
        note:
          'Two serous layers separated by a few microns of fluid. Sliding there is what lets the lung change shape without dragging on the chest wall.',
      },
    });
  }

  // Peritoneum & mesentery
  {
    const g = sheet(
      (u, v, out) => {
        const y = lerp(0.95, 1.2, v);
        const th = (u - 0.5) * Math.PI * 1.7;
        const p = trunkSurface(y, th, 0.03);
        out.copy(p);
      },
      q.high ? 22 : 15,
      q.high ? 16 : 11
    );
    add({
      key: 'fascia:peritoneum',
      layer: 'fasciaVisc',
      name: 'Peritoneum',
      latin: 'peritoneum',
      group: 'Visceral membranes',
      region: 'abdominal',
      geometry: g,
      material: mat({ ...VISC, opacity: 0.22 }),
      center: V(0, 1.07, 0.02),
      span: 0.34,
    });

    // mesenteric fan
    const fan = sheet(
      (u, v, out) => {
        const root = V(lerp(-0.02, 0.05, u), lerp(1.13, 1.02, u), -0.018);
        const edge = V(Math.sin(u * Math.PI * 2.4) * 0.075, lerp(1.09, 0.99, u), 0.055 + Math.cos(u * 5.0) * 0.012);
        out.lerpVectors(root, edge, v);
        out.y += Math.sin(v * Math.PI) * 0.006;
      },
      q.high ? 26 : 18,
      10
    );
    add({
      key: 'fascia:mesentery',
      layer: 'fasciaVisc',
      name: 'Mesentery',
      latin: 'mesenterium',
      group: 'Visceral membranes',
      region: 'abdominal',
      geometry: fan,
      material: mat({ ...VISC, opacity: 0.36, color: 0x8fd0ff }),
      center: V(0.01, 1.06, 0.02),
      span: 0.26,
      info: {
        note:
          'The suspension of the gut, and a dense field of slow interoceptive endings. Mesenteric tension is one of the strongest single contributors to the visceral afferent stream.',
      },
    });
  }

  /* ============================================================
     Myofascial continuities
     ============================================================ */
  for (const inst of chainInstances()) {
    const c = inst.chain;
    const pts = sample(spline(inst.points, 0.5), q.high ? 90 : 60);
    const g = ribbon(pts, (t) => c.width * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.02) * Math.PI)), {
      refUp: V(0, 0, 1),
      thickness: 0.0022,
      twist: (t) => (c.id === 'spiral' ? t * Math.PI * 1.4 : 0),
    });
    add({
      key: inst.key,
      layer: 'chains',
      name: inst.label,
      latin: 'continuum myofasciale',
      group: 'Myofascial continuities',
      region: 'multi',
      side: inst.side,
      geometry: g,
      material: mat({
        color: new THREE.Color(c.color).getHex(),
        opacity: 0.82,
        rough: 0.45,
        spec: 0.4,
        rim: 1.1,
        mode: 'xray',
        xrayFloor: 0.62, // a thin ribbon must read face-on, not only at its edge
        doubleSide: true,
        stripe: 0.5,
        stripeFreq: 420,
      }),
      center: pts[Math.floor(pts.length / 2)].clone(),
      span: 1.2,
      info: { note: c.blurb, receptors: c.receptors },
    });
  }

  /* ============================================================
     Intermuscular septa — the deep partitions that make compartments
     ============================================================ */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const parts = [];
    for (const [ang, y0, y1] of [
      [0, 0.92, 0.5],
      [Math.PI, 0.92, 0.5],
    ]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const y = lerp(y0, y1, t);
        const r = 0.086 - 0.024 * t;
        pts.push(V(s * (0.086 - 0.024 * t) + Math.sin(ang) * 0.004, y, Math.cos(ang) * r * 0.75));
      }
      parts.push(ribbon(pts, () => 0.022, { refUp: V(1, 0, 0), thickness: 0.0012 }));
    }
    add({
      key: `fascia:septa:${tag}`,
      layer: 'fasciaDeep',
      name: `Intermuscular septa · ${s > 0 ? 'left' : 'right'} thigh`,
      latin: 'septa intermuscularia',
      group: 'Septa',
      region: 'lowerLimb',
      side: s,
      geometry: merge(parts),
      material: mat({ ...DEEP, opacity: 0.34 }),
      center: V(s * 0.075, 0.7, 0),
      span: 0.5,
      info: {
        note:
          'Septa run from the investing sleeve to the bone, dividing the limb into pressurised compartments. They are load paths in their own right, and where nerves cross them, glide matters.',
      },
    });
  }
}

/* ------------------------------------------------------------
   limb sleeve helper
   ------------------------------------------------------------ */

function legStations(s) {
  const out = [];
  // starts inside the trunk envelope so the two shells overlap rather than abut
  const chain = spline([
    V(s * 0.082, 0.98, 0.004),
    V(s * 0.088, 0.9, 0.004),
    V(s * 0.078, 0.78, 0.006),
    V(s * 0.062, 0.5, 0.008),
    V(s * 0.054, 0.26, 0.0),
    V(s * 0.05, 0.09, -0.008),
  ]);
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = chain.getPoint(t);
    const thigh = 0.086 - 0.022 * Math.min(1, t / 0.5);
    const calf = 0.062 - 0.03 * Math.min(1, Math.max(0, (t - 0.5) / 0.5));
    const belly = 0.012 * Math.sin(Math.min(1, Math.max(0, (t - 0.5) / 0.34)) * Math.PI);
    const r = (t < 0.5 ? thigh : calf) + belly;
    out.push({ pos: p, r, flat: 1.06 });
  }
  return out;
}

function armStations(s) {
  const out = [];
  const chain = spline([
    V(s * 0.164, 1.4, 0.004),
    V(s * 0.196, 1.24, -0.004),
    V(s * 0.226, 1.086, -0.008),
    V(s * 0.246, 0.96, 0.006),
    V(s * 0.262, 0.844, 0.016),
  ]);
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = chain.getPoint(t);
    const upper = 0.048 - 0.008 * Math.min(1, t / 0.5);
    const fore = 0.044 - 0.019 * Math.min(1, Math.max(0, (t - 0.5) / 0.5));
    out.push({ pos: p, r: t < 0.5 ? upper : fore, flat: 1.05 });
  }
  return out;
}

function limbSleeve(stations, offset, q) {
  const pts = stations.map((s) => s.pos);
  const prof = stations.map((s) => ({
    a: Math.max(0.004, (s.r + offset) * (s.flat || 1)),
    b: Math.max(0.004, (s.r + offset) / (s.flat || 1)),
    n: 2.1,
  }));
  return loft(pts, prof, q.high ? 20 : 14, { capStart: false, capEnd: false });
}

export { legStations, armStations, limbSleeve };
