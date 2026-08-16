/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Muscles — the adjustable tensioners.

   Each belly is a fusiform loft between its attachment landmarks,
   tapering into tendon at both ends. Muscles carry the spindle and
   Golgi populations, so they are also the main proprioceptive
   sources in the model.
   ============================================================ */

import * as THREE from 'three';
import { muscleBelly, spline, sample, merge } from './build.js';
import { LM, side, ribPoints, trunkSurface } from './landmarks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MUSCLE = {
  color: 0xc74a52,
  opacity: 0.9,
  rough: 0.62,
  spec: 0.22,
  rim: 0.4,
  stripe: 0.42,
  stripeFreq: 90,
};

/**
 * Muscle table. `path` returns attachment-to-attachment control points;
 * `r` is the maximum belly radius; `flat` > 1 flattens the belly into a sheet.
 */
function table() {
  return [
    /* ---- posterior trunk ---- */
    {
      id: 'erectorSpinae',
      name: 'Erector spinae',
      latin: 'm. erector spinae',
      group: 'Paraspinal',
      region: 'thoracic',
      bilateral: true,
      r: 0.021,
      flat: 1.5,
      peak: 0.5,
      path: (s) => [
        V(s * 0.03, 0.96, -0.05),
        V(s * 0.032, 1.05, -0.058),
        V(s * 0.032, 1.16, -0.062),
        V(s * 0.03, 1.28, -0.07),
        V(s * 0.028, 1.38, -0.062),
        V(s * 0.026, 1.46, -0.05),
      ],
      note:
        'Continuous from sacrum to skull as a series of overlapping tracts wrapped in the thoracolumbar and nuchal fascia. It works as a tension band, not a stack of individual pullers.',
    },
    {
      id: 'latissimus',
      name: 'Latissimus dorsi',
      latin: 'm. latissimus dorsi',
      group: 'Posterior trunk',
      region: 'thoracic',
      bilateral: true,
      r: 0.03,
      flat: 3.4,
      peak: 0.62,
      path: (s) => [
        V(s * 0.17, 1.385, -0.014),
        V(s * 0.128, 1.34, -0.056),
        V(s * 0.09, 1.24, -0.072),
        V(s * 0.05, 1.12, -0.07),
        V(s * 0.036, 1.03, -0.058),
      ],
      note:
        'Runs from the arm into the thoracolumbar fascia and the crest, coupling the shoulder to the opposite hip through the fascial sheet.',
    },
    {
      id: 'trapezius',
      name: 'Trapezius',
      latin: 'm. trapezius',
      group: 'Posterior trunk',
      region: 'cervical',
      bilateral: true,
      r: 0.02,
      flat: 3.0,
      peak: 0.45,
      path: (s) => [
        V(s * 0.014, 1.63, -0.062),
        V(s * 0.06, 1.5, -0.06),
        V(s * 0.12, 1.44, -0.05),
        V(s * 0.168, 1.412, -0.016),
      ],
      note: 'Sheet-like and continuous with the nuchal fascia — a broad tension distributor rather than a discrete puller.',
    },
    {
      id: 'rhomboid',
      name: 'Rhomboids',
      latin: 'mm. rhomboidei',
      group: 'Posterior trunk',
      region: 'thoracic',
      bilateral: true,
      r: 0.014,
      flat: 3,
      path: (s) => [V(s * 0.014, 1.42, -0.05), V(s * 0.05, 1.38, -0.062), V(s * 0.084, 1.33, -0.072)],
      note: 'Suspends the scapula medially; part of the sling that keeps a floating bone in place.',
    },
    {
      id: 'quadratusLumborum',
      name: 'Quadratus lumborum',
      latin: 'm. quadratus lumborum',
      group: 'Deep posterior',
      region: 'lumbar',
      bilateral: true,
      r: 0.016,
      flat: 2.2,
      path: (s) => [V(s * 0.058, 1.03, -0.03), V(s * 0.05, 1.09, -0.03), V(s * 0.04, 1.16, -0.034)],
      note: 'Bridges the crest to the twelfth rib, directly influencing the caudal attachment of the diaphragm.',
    },
    {
      id: 'splenius',
      name: 'Splenius & suboccipitals',
      latin: 'mm. splenii, suboccipitales',
      group: 'Deep cervical',
      region: 'cervical',
      bilateral: true,
      r: 0.011,
      flat: 1.8,
      path: (s) => [V(s * 0.022, 1.44, -0.05), V(s * 0.03, 1.52, -0.05), V(s * 0.03, 1.6, -0.062)],
      note:
        'The suboccipital group has one of the highest spindle densities anywhere — roughly 200 per gram, against 5 or fewer in a large limb muscle. Head-position sense depends on it.',
      receptors: ['spindle', 'ruffini', 'free'],
    },

    /* ---- anterior trunk ---- */
    {
      id: 'rectusAbdominis',
      name: 'Rectus abdominis',
      latin: 'm. rectus abdominis',
      group: 'Abdominal wall',
      region: 'abdominal',
      bilateral: true,
      r: 0.019,
      flat: 1.6,
      peak: 0.5,
      path: (s) => [
        V(s * 0.024, 0.94, 0.052),
        V(s * 0.028, 1.02, 0.082),
        V(s * 0.03, 1.1, 0.09),
        V(s * 0.03, 1.18, 0.086),
        V(s * 0.028, 1.23, 0.078),
      ],
      note: 'Segmented by transverse tendinous bands and wrapped in the linea alba — a strap in series with the whole anterior line.',
    },
    {
      id: 'obliqueExternal',
      name: 'External oblique',
      latin: 'm. obliquus externus abdominis',
      group: 'Abdominal wall',
      region: 'abdominal',
      bilateral: true,
      r: 0.02,
      flat: 4,
      path: (s) => [
        V(s * 0.108, 1.02, 0.03),
        trunkSurface(1.08, s * 0.9, 0.016),
        trunkSurface(1.16, s * 0.7, 0.016),
        V(s * 0.088, 1.22, 0.03),
      ],
      note: 'Its fibres run down and forward; the internal layer crosses it, so the abdominal wall behaves as a cross-ply pressure vessel.',
    },
    {
      id: 'obliqueInternal',
      name: 'Internal oblique & transversus',
      latin: 'mm. obliquus internus, transversus abdominis',
      group: 'Abdominal wall',
      region: 'abdominal',
      bilateral: true,
      r: 0.017,
      flat: 4,
      path: (s) => [
        V(s * 0.1, 1.2, 0.036),
        trunkSurface(1.14, s * 0.75, 0.022),
        trunkSurface(1.06, s * 0.95, 0.022),
        V(s * 0.1, 1.0, 0.02),
      ],
      note: 'Transversus is the deepest layer and the one that sets intra-abdominal pressure — a direct mechanical input to the visceral afferents.',
    },
    {
      id: 'pectoralis',
      name: 'Pectoralis major',
      latin: 'm. pectoralis major',
      group: 'Anterior trunk',
      region: 'thoracic',
      bilateral: true,
      r: 0.024,
      flat: 3.2,
      path: (s) => [V(s * 0.016, 1.3, 0.084), V(s * 0.08, 1.34, 0.072), V(s * 0.14, 1.372, 0.04), V(s * 0.172, 1.382, 0.012)],
      note: 'Continuous into the arm fascia; loading the grip raises tension across the sternum.',
    },
    {
      id: 'scm',
      name: 'Sternocleidomastoid',
      latin: 'm. sternocleidomastoideus',
      group: 'Anterior cervical',
      region: 'cervical',
      bilateral: true,
      r: 0.012,
      path: (s) => [V(s * 0.018, 1.4, 0.062), V(s * 0.034, 1.46, 0.036), V(s * 0.046, 1.52, 0.006), side(LM.mastoid, s)],
      note: 'Wrapped by the investing layer of deep cervical fascia; a common site where superficial tension alters deep cervical afferent traffic.',
    },
    {
      id: 'scalene',
      name: 'Scalenes',
      latin: 'mm. scaleni',
      group: 'Deep cervical',
      region: 'cervical',
      bilateral: true,
      r: 0.009,
      path: (s) => [V(s * 0.024, 1.45, -0.006), V(s * 0.032, 1.49, 0.0), V(s * 0.038, 1.53, -0.004)],
      note:
        'Accessory respiratory muscles that also form the walls of the interscalene interval, through which the brachial plexus and subclavian vessels pass.',
      receptors: ['spindle', 'free', 'ruffini'],
    },
    {
      id: 'diaphragm',
      name: 'Diaphragm',
      latin: 'diaphragma',
      group: 'Respiratory',
      region: 'thoracic',
      bilateral: false,
      custom: 'diaphragm',
      note:
        'A domed sheet, not a flat piston. It is the tensional roof of the abdomen and floor of the mediastinum simultaneously, and its crura tie the breath to the upper lumbar spine.',
      receptors: ['spindle', 'golgi', 'free', 'intero'],
    },
    {
      id: 'psoas',
      name: 'Psoas major & iliacus',
      latin: 'm. psoas major, m. iliacus',
      group: 'Deep front',
      region: 'lumbar',
      bilateral: true,
      r: 0.017,
      path: (s) => [V(s * 0.026, 1.16, -0.014), V(s * 0.036, 1.08, 0.004), V(s * 0.05, 1.0, 0.018), V(s * 0.07, 0.95, 0.02), V(s * 0.086, 0.928, 0.006)],
      note:
        'The only muscle joining spine to leg. It runs inside the deep front line in contact with the diaphragm above and the pelvic floor below, and it lies directly against the visceral compartment.',
    },
    {
      id: 'intercostals',
      name: 'Intercostals',
      latin: 'mm. intercostales',
      group: 'Respiratory',
      region: 'thoracic',
      bilateral: true,
      custom: 'intercostals',
      note:
        'Two crossing layers spanning every rib interval, converting the cage into a woven tension structure that changes shape rather than hinging.',
      receptors: ['spindle', 'golgi', 'free', 'pacinian'],
    },

    /* ---- lower limb ---- */
    {
      id: 'glutealMax',
      name: 'Gluteus maximus',
      latin: 'm. gluteus maximus',
      group: 'Hip',
      region: 'pelvic',
      bilateral: true,
      r: 0.032,
      flat: 1.9,
      path: (s) => [V(s * 0.03, 1.01, -0.05), V(s * 0.07, 0.97, -0.062), V(s * 0.104, 0.92, -0.052), V(s * 0.108, 0.87, -0.02)],
      note: 'Its fascia is continuous with the thoracolumbar fascia above and the fascia lata below — a key link in the posterior functional line.',
    },
    {
      id: 'glutealMed',
      name: 'Gluteus medius & minimus',
      latin: 'mm. glutei medius, minimus',
      group: 'Hip',
      region: 'pelvic',
      bilateral: true,
      r: 0.02,
      flat: 2.1,
      path: (s) => [V(s * 0.11, 1.02, -0.008), V(s * 0.118, 0.98, -0.014), V(s * 0.104, 0.936, -0.008)],
      note: 'Frontal-plane stabiliser working through the fascia lata rather than in isolation.',
    },
    {
      id: 'hamstrings',
      name: 'Hamstrings',
      latin: 'mm. biceps femoris, semitendinosus, semimembranosus',
      group: 'Thigh',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.028,
      peak: 0.5,
      path: (s) => [side(LM.ischium, s), V(s * 0.072, 0.76, -0.05), V(s * 0.068, 0.62, -0.046), V(s * 0.064, 0.51, -0.03)],
      note: 'In series with the sacrotuberous ligament above and the calf below; the middle link of the posterior line.',
    },
    {
      id: 'quadriceps',
      name: 'Quadriceps femoris',
      latin: 'm. quadriceps femoris',
      group: 'Thigh',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.032,
      peak: 0.48,
      path: (s) => [V(s * 0.098, 0.94, 0.03), V(s * 0.08, 0.8, 0.05), V(s * 0.07, 0.64, 0.05), V(s * 0.064, 0.52, 0.038)],
      note: 'Its tendon encloses the patella, converting muscle tension into a compression element floating in that tendon.',
    },
    {
      id: 'adductors',
      name: 'Adductor group',
      latin: 'mm. adductores',
      group: 'Thigh',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.022,
      flat: 1.4,
      path: (s) => [V(s * 0.026, 0.93, 0.024), V(s * 0.042, 0.82, 0.016), V(s * 0.05, 0.68, 0.008), V(s * 0.056, 0.55, 0.004)],
      note: 'Part of the deep front line, running from the pubic ramus down the medial thigh into the knee capsule.',
    },
    {
      id: 'gastroc',
      name: 'Gastrocnemius & soleus',
      latin: 'm. triceps surae',
      group: 'Calf',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.026,
      peak: 0.35,
      path: (s) => [V(s * 0.066, 0.47, -0.032), V(s * 0.07, 0.38, -0.05), V(s * 0.064, 0.26, -0.046), V(s * 0.054, 0.14, -0.03), V(s * 0.052, 0.05, -0.036)],
      note: 'Continuous with the plantar fascia across the calcaneus — mechanically one structure with the sole of the foot.',
    },
    {
      id: 'tibialisAnt',
      name: 'Tibialis anterior & extensors',
      latin: 'm. tibialis anterior',
      group: 'Shank',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.014,
      path: (s) => [V(s * 0.064, 0.44, 0.026), V(s * 0.062, 0.32, 0.03), V(s * 0.058, 0.18, 0.022), V(s * 0.056, 0.08, 0.014)],
      note: 'Held down by the crural retinacula, which are richly populated with Ruffini endings reporting ankle position.',
    },
    {
      id: 'peroneal',
      name: 'Peroneal group',
      latin: 'mm. peronei',
      group: 'Shank',
      region: 'lowerLimb',
      bilateral: true,
      r: 0.012,
      path: (s) => [V(s * 0.088, 0.44, -0.006), V(s * 0.09, 0.3, -0.002), V(s * 0.082, 0.16, -0.006), V(s * 0.07, 0.07, -0.014)],
      note: 'The lateral line’s lower link, tracking frontal-plane load at the ankle.',
    },

    /* ---- upper limb ---- */
    {
      id: 'deltoid',
      name: 'Deltoid',
      latin: 'm. deltoideus',
      group: 'Shoulder',
      region: 'upperLimb',
      bilateral: true,
      r: 0.024,
      flat: 1.5,
      path: (s) => [V(s * 0.12, 1.408, 0.028), V(s * 0.176, 1.4, 0.0), V(s * 0.19, 1.33, -0.006), V(s * 0.196, 1.27, -0.008)],
      note: 'Wraps the joint in three functional heads; a tensional cap rather than a single line of pull.',
    },
    {
      id: 'rotatorCuff',
      name: 'Rotator cuff',
      latin: 'mm. supraspinatus, infraspinatus, subscapularis, teres minor',
      group: 'Shoulder',
      region: 'upperLimb',
      bilateral: true,
      r: 0.013,
      flat: 2.4,
      path: (s) => [V(s * 0.09, 1.4, -0.056), V(s * 0.128, 1.394, -0.03), V(s * 0.16, 1.39, -0.004)],
      note: 'Holds the humeral head centred by balanced tension — the shoulder is a tensegrity joint, not a load-bearing socket.',
    },
    {
      id: 'bicepsBrachii',
      name: 'Biceps brachii',
      latin: 'm. biceps brachii',
      group: 'Arm',
      region: 'upperLimb',
      bilateral: true,
      r: 0.017,
      peak: 0.45,
      path: (s) => [V(s * 0.166, 1.386, 0.012), V(s * 0.192, 1.29, 0.012), V(s * 0.212, 1.17, 0.008), V(s * 0.222, 1.09, 0.002)],
      note: 'Its aponeurosis blends into the forearm fascia, so elbow force is shared with the whole flexor compartment.',
    },
    {
      id: 'tricepsBrachii',
      name: 'Triceps brachii',
      latin: 'm. triceps brachii',
      group: 'Arm',
      region: 'upperLimb',
      bilateral: true,
      r: 0.017,
      peak: 0.5,
      path: (s) => [V(s * 0.164, 1.39, -0.024), V(s * 0.19, 1.29, -0.026), V(s * 0.212, 1.17, -0.026), V(s * 0.226, 1.096, -0.018)],
      note: 'Continuous with the back arm line into the extensor retinaculum and the dorsum of the hand.',
    },
    {
      id: 'forearmFlexors',
      name: 'Forearm flexors',
      latin: 'mm. flexores antebrachii',
      group: 'Forearm',
      region: 'upperLimb',
      bilateral: true,
      r: 0.017,
      peak: 0.34,
      path: (s) => [V(s * 0.222, 1.082, 0.008), V(s * 0.238, 1.0, 0.018), V(s * 0.252, 0.92, 0.022), V(s * 0.26, 0.85, 0.02)],
      note: 'Long tendons cross two joints inside fascial tunnels; glide there matters more than raw strength.',
    },
    {
      id: 'forearmExtensors',
      name: 'Forearm extensors',
      latin: 'mm. extensores antebrachii',
      group: 'Forearm',
      region: 'upperLimb',
      bilateral: true,
      r: 0.015,
      peak: 0.34,
      path: (s) => [V(s * 0.232, 1.084, -0.016), V(s * 0.248, 1.0, -0.012), V(s * 0.262, 0.92, -0.002), V(s * 0.266, 0.85, 0.004)],
      note: 'Pass under the extensor retinaculum, a dense Ruffini-rich band that reports wrist position.',
    },
  ];
}

/** Exposed so the receptor system can seed spindles and tendon organs correctly. */
export function muscleTable() {
  return table();
}

export function buildMuscles(ctx) {
  const { add, mat, q } = ctx;
  const seg = q.high ? 14 : 10;

  for (const m of table()) {
    const sides = m.bilateral ? [1, -1] : [0];
    for (const s of sides) {
      const tag = s === 0 ? '' : s > 0 ? ':L' : ':R';
      const label = s === 0 ? m.name : `${m.name} · ${s > 0 ? 'left' : 'right'}`;
      let geom;
      let center;

      if (m.custom === 'diaphragm') {
        geom = diaphragmGeometry(q);
        center = V(0, 1.22, 0.006);
      } else if (m.custom === 'intercostals') {
        const parts = [];
        for (const sg of [1, -1]) {
          for (let i = 0; i < 11; i++) {
            const a = ribPoints(i, sg, 20);
            const b = ribPoints(i + 1, sg, 20);
            for (const k of [5, 9, 13, 17]) {
              const p0 = a[k];
              const p1 = b[Math.min(19, k + 1)];
              parts.push(
                muscleBelly([p0, p0.clone().lerp(p1, 0.5), p1], 0.0075, { radial: 6, tendon: 0.4, flat: 1.6 })
              );
            }
          }
        }
        geom = merge(parts);
        center = V(0, 1.29, 0.0);
      } else {
        const pts = sample(spline(m.path(s || 1)), seg);
        // a flattened belly is a wide sheet: it needs more radial segments than a
        // round one or the silhouette facets show
        const flat = m.flat ?? 1;
        geom = muscleBelly(pts, m.r, {
          radial: Math.round((q.high ? 12 : 9) + flat * 3),
          flat,
          peak: m.peak ?? 0.45,
          tendon: 0.2,
        });
        center = pts[Math.floor(pts.length / 2)].clone();
      }

      add({
        key: `muscle:${m.id}${tag}`,
        layer: 'muscle',
        name: label,
        latin: m.latin,
        group: m.group,
        region: m.region,
        side: s,
        geometry: geom,
        material: mat(MUSCLE),
        center,
        span: 0.3,
        info: { note: m.note, receptors: m.receptors },
      });
    }
  }
}

/** Domed sheet with a central tendon and descending crura. */
function diaphragmGeometry(q) {
  const nu = q.high ? 30 : 20;
  const nv = q.high ? 16 : 11;
  const verts = [];
  const uvs = [];
  const idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    const th = (i / nu) * Math.PI * 2;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv; // 0 = rim, 1 = apex
      const rx = 0.128 * (1 - v * 0.94);
      const rz = 0.092 * (1 - v * 0.94);
      // two hemidomes; the right sits a little higher because the liver is under it
      const hemi = Math.sin(th) > 0 ? 1.0 : 1.035;
      const y = 1.192 + Math.sin(v * Math.PI * 0.5) * 0.064 * hemi;
      p.set(Math.sin(th) * rx, y, Math.cos(th) * rz + 0.004 + v * 0.006);
      verts.push(p.x, p.y, p.z);
      uvs.push(i / nu, v);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  const dome = new THREE.BufferGeometry();
  dome.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  dome.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  dome.setIndex(idx);
  dome.computeVertexNormals();

  const parts = [dome];
  // crura descending onto L1–L3
  for (const s of [1, -1]) {
    const cr = sample(
      spline([V(s * 0.02, 1.196, -0.03), V(s * 0.022, 1.16, -0.026), V(s * 0.024, 1.11, -0.024), V(s * 0.022, 1.07, -0.026)]),
      9
    );
    parts.push(muscleBelly(cr, 0.0095, { radial: 8, flat: 1.4, tendon: 0.5, peak: 0.35 }));
  }
  return merge(parts);
}
