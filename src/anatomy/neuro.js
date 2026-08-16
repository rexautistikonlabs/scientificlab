/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Nervous system — the transmission network.

   Peripheral nerves, plexuses, roots, cord and the ascending
   tracts. Every trunk carries a `pathway` tag and a `sourceRegion`,
   which is what lets the afferent system route traffic from the
   receptor fields through the right nerve to the right destination.
   ============================================================ */

import * as THREE from 'three';
import { tube, spline, sample, merge } from './build.js';
import { VERTEBRAE, vertebra } from './landmarks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const NERVE = { color: 0xf0b429, opacity: 0.95, rim: 0.6 };

/** Peripheral trunks. `path` gives control points; `pathway` selects the tract. */
export function nerveTrunks() {
  return trunks();
}

function trunks() {
  return [
    {
      id: 'sciatic',
      name: 'Sciatic nerve',
      latin: 'n. ischiadicus',
      group: 'Lumbosacral plexus',
      region: 'lowerLimb',
      r: 0.0058,
      speed: 0.62,
      pathway: 'dorsalColumn',
      source: 'lowerLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.03, 0.99, -0.04),
        V(s * 0.058, 0.95, -0.036),
        V(s * 0.072, 0.9, -0.044),
        V(s * 0.07, 0.78, -0.042),
        V(s * 0.066, 0.64, -0.038),
        V(s * 0.062, 0.52, -0.03),
      ],
    },
    {
      id: 'tibial',
      name: 'Tibial nerve',
      latin: 'n. tibialis',
      group: 'Lumbosacral plexus',
      region: 'lowerLimb',
      r: 0.0038,
      speed: 0.6,
      pathway: 'dorsalColumn',
      source: 'lowerLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.062, 0.52, -0.03),
        V(s * 0.058, 0.4, -0.026),
        V(s * 0.054, 0.24, -0.02),
        V(s * 0.05, 0.11, -0.018),
        V(s * 0.05, 0.05, -0.012),
        V(s * 0.052, 0.026, 0.03),
      ],
    },
    {
      id: 'peroneal',
      name: 'Common peroneal nerve',
      latin: 'n. peroneus communis',
      group: 'Lumbosacral plexus',
      region: 'lowerLimb',
      r: 0.0032,
      speed: 0.6,
      pathway: 'dorsalColumn',
      source: 'lowerLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.064, 0.53, -0.028),
        V(s * 0.08, 0.47, -0.014),
        V(s * 0.084, 0.36, 0.006),
        V(s * 0.07, 0.2, 0.014),
        V(s * 0.058, 0.08, 0.024),
      ],
    },
    {
      id: 'femoral',
      name: 'Femoral nerve',
      latin: 'n. femoralis',
      group: 'Lumbar plexus',
      region: 'lowerLimb',
      r: 0.0042,
      speed: 0.64,
      pathway: 'dorsalColumn',
      source: 'lowerLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.026, 1.11, -0.014),
        V(s * 0.05, 1.02, 0.01),
        V(s * 0.07, 0.96, 0.03),
        V(s * 0.078, 0.87, 0.04),
        V(s * 0.072, 0.72, 0.044),
        V(s * 0.066, 0.56, 0.042),
      ],
    },
    {
      id: 'brachialPlexus',
      name: 'Brachial plexus',
      latin: 'plexus brachialis',
      group: 'Brachial plexus',
      region: 'upperLimb',
      r: 0.005,
      speed: 0.7,
      pathway: 'dorsalColumn',
      source: 'upperLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.02, 1.49, -0.012),
        V(s * 0.042, 1.46, -0.004),
        V(s * 0.072, 1.43, 0.006),
        V(s * 0.11, 1.41, 0.01),
        V(s * 0.15, 1.395, 0.008),
      ],
      note:
        'Passes between the scalenes and under the clavicle inside a fascial tunnel. Its mechanical environment is set by cervical, thoracic and shoulder-girdle tension together.',
    },
    {
      id: 'median',
      name: 'Median nerve',
      latin: 'n. medianus',
      group: 'Brachial plexus',
      region: 'upperLimb',
      r: 0.0032,
      speed: 0.68,
      pathway: 'dorsalColumn',
      source: 'upperLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.15, 1.395, 0.008),
        V(s * 0.182, 1.29, 0.008),
        V(s * 0.212, 1.16, 0.006),
        V(s * 0.232, 1.03, 0.014),
        V(s * 0.252, 0.9, 0.02),
        V(s * 0.262, 0.845, 0.024),
        V(s * 0.27, 0.76, 0.036),
      ],
    },
    {
      id: 'ulnar',
      name: 'Ulnar nerve',
      latin: 'n. ulnaris',
      group: 'Brachial plexus',
      region: 'upperLimb',
      r: 0.0028,
      speed: 0.66,
      pathway: 'dorsalColumn',
      source: 'upperLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.152, 1.392, -0.002),
        V(s * 0.184, 1.28, -0.014),
        V(s * 0.216, 1.15, -0.02),
        V(s * 0.238, 1.02, -0.008),
        V(s * 0.258, 0.9, 0.004),
        V(s * 0.268, 0.8, 0.016),
      ],
    },
    {
      id: 'radial',
      name: 'Radial nerve',
      latin: 'n. radialis',
      group: 'Brachial plexus',
      region: 'upperLimb',
      r: 0.003,
      speed: 0.66,
      pathway: 'dorsalColumn',
      source: 'upperLimb',
      bilateral: true,
      path: (s) => [
        V(s * 0.154, 1.39, -0.008),
        V(s * 0.19, 1.3, -0.024),
        V(s * 0.214, 1.18, -0.026),
        V(s * 0.234, 1.09, -0.012),
        V(s * 0.252, 0.96, -0.004),
        V(s * 0.264, 0.86, 0.006),
      ],
    },
    {
      id: 'vagus',
      name: 'Vagus nerve',
      latin: 'n. vagus',
      group: 'Cranial nerves',
      region: 'visceral',
      r: 0.0032,
      speed: 0.22,
      pathway: 'vagal',
      source: 'visceral',
      bilateral: true,
      path: (s) => [
        V(s * 0.024, 1.6, -0.024),
        V(s * 0.03, 1.52, 0.004),
        V(s * 0.028, 1.44, 0.014),
        V(s * 0.022, 1.36, 0.014),
        V(s * 0.014, 1.28, 0.012),
        V(s * 0.01, 1.22, 0.014),
        V(s * 0.02, 1.17, 0.024),
        V(s * 0.014, 1.1, 0.024),
      ],
    },
    {
      id: 'phrenic',
      name: 'Phrenic nerve',
      latin: 'n. phrenicus',
      group: 'Cervical plexus',
      region: 'thoracic',
      r: 0.0024,
      speed: 0.6,
      pathway: 'dorsalColumn',
      source: 'thoracic',
      bilateral: true,
      path: (s) => [
        V(s * 0.026, 1.5, -0.006),
        V(s * 0.032, 1.44, 0.006),
        V(s * 0.03, 1.36, 0.012),
        V(s * 0.028, 1.28, 0.014),
        V(s * 0.03, 1.22, 0.016),
        V(s * 0.038, 1.2, 0.014),
      ],
    },
    {
      id: 'sympatheticChain',
      name: 'Sympathetic chain',
      latin: 'truncus sympathicus',
      group: 'Autonomic',
      region: 'visceral',
      r: 0.0022,
      speed: 0.3,
      pathway: 'sympathetic',
      source: 'visceral',
      bilateral: true,
      path: (s) => {
        const out = [];
        for (const v of VERTEBRAE) {
          if (v.region === 'S') continue;
          out.push(V(s * 0.017, v.pos.y, v.pos.z + 0.012));
        }
        return out;
      },
    },
  ];
}

export function buildNeuro(ctx) {
  const { add, mat, q } = ctx;
  const seg = q.high ? 1.4 : 1;

  /* ---------------- spinal cord + ascending tracts ---------------- */
  {
    const cordPts = sample(
      spline(
        VERTEBRAE.filter((v) => v.region !== 'S' || v.label === 'S1').map((v) =>
          V(0, v.pos.y, v.pos.z - 0.006)
        ),
        0.5
      ),
      q.high ? 60 : 40
    );
    // brainstem continuation
    const stem = sample(spline([V(0, 1.565, -0.014), V(0, 1.6, -0.014), V(0, 1.64, -0.008), V(0, 1.665, 0.004)]), 10);
    add({
      key: 'nerve:cord',
      layer: 'nerve',
      name: 'Spinal cord & brainstem',
      latin: 'medulla spinalis',
      group: 'Central pathways',
      region: 'axial',
      geometry: merge([tube(cordPts, () => 0.0072, 10), tube(stem, (t) => 0.0082 + 0.003 * t, 10)]),
      material: mat({ ...NERVE, color: 0xffd166, opacity: 0.9, rate: 5.0, speed: 0.85, nerve: true }),
      center: V(0, 1.25, -0.04),
      span: 0.8,
      pathway: 'dorsalColumn',
      source: 'axial',
      info: {
        note:
          'Every afferent stream in the model converges here. The cord is tethered by the dura and denticulate ligaments and moves several millimetres with trunk motion, so it is itself part of the mechanical network.',
      },
    });

    // ascending tract highlight running inside the cord
    add({
      key: 'nerve:dorsalColumn',
      layer: 'nerve',
      name: 'Dorsal column — medial lemniscus',
      latin: 'fasciculus gracilis et cuneatus',
      group: 'Central pathways',
      region: 'axial',
      geometry: tube(
        cordPts.map((p) => V(p.x, p.y, p.z - 0.005)),
        () => 0.0032,
        7
      ),
      material: mat({ ...NERVE, color: 0x4fd6e0, opacity: 0.9, rate: 8.0, speed: 1.5, nerve: true }),
      center: V(0, 1.25, -0.046),
      span: 0.8,
      pathway: 'dorsalColumn',
      source: 'axial',
      info: {
        note:
          'Carries discriminative touch, vibration and conscious proprioception with the highest fidelity and shortest latency of any afferent route.',
      },
    });

    add({
      key: 'nerve:anterolateral',
      layer: 'nerve',
      name: 'Anterolateral system',
      latin: 'tractus spinothalamicus',
      group: 'Central pathways',
      region: 'axial',
      geometry: merge(
        [1, -1].map((s) =>
          tube(
            cordPts.map((p) => V(p.x + s * 0.005, p.y, p.z + 0.003)),
            () => 0.0026,
            6
          )
        )
      ),
      material: mat({ ...NERVE, color: 0xff8f6a, opacity: 0.85, rate: 2.0, speed: 0.3, nerve: true }),
      center: V(0, 1.25, -0.04),
      span: 0.8,
      pathway: 'anterolateral',
      source: 'axial',
      info: {
        note:
          'Slow, small-diameter traffic: sustained pressure, thermal and nociceptive information, and much of what becomes felt bodily state.',
      },
    });
  }

  /* ---------------- spinal roots ---------------- */
  {
    const parts = [];
    for (const v of VERTEBRAE) {
      if (v.region === 'S') continue;
      for (const s of [1, -1]) {
        const p = sample(
          spline([
            V(0.002 * s, v.pos.y, v.pos.z - 0.004),
            V(s * 0.014, v.pos.y - 0.003, v.pos.z + 0.002),
            V(s * 0.026, v.pos.y - 0.006, v.pos.z + 0.006),
          ]),
          5
        );
        parts.push(tube(p, (t) => 0.0024 * (1 - 0.2 * t), 5));
        // dorsal root ganglion
        parts.push(
          tube(
            [V(s * 0.021, v.pos.y - 0.005, v.pos.z + 0.004), V(s * 0.027, v.pos.y - 0.0065, v.pos.z + 0.007)],
            () => 0.0034,
            6
          )
        );
      }
    }
    add({
      key: 'nerve:roots',
      layer: 'nerve',
      name: 'Spinal roots & dorsal root ganglia',
      latin: 'radices spinales, ganglia spinalia',
      group: 'Central pathways',
      region: 'axial',
      geometry: merge(parts),
      material: mat({ ...NERVE, color: 0xf5c04a, opacity: 0.9, rate: 4.0, speed: 0.9, nerve: true }),
      center: V(0, 1.2, -0.03),
      span: 0.7,
      pathway: 'dorsalColumn',
      source: 'axial',
      info: {
        note:
          'Every primary afferent cell body in the body sits in one of these ganglia. They lie in the intervertebral foramen, so segmental mechanics act on them directly.',
      },
    });
  }

  /* ---------------- intercostal nerves ---------------- */
  {
    const parts = [];
    for (const s of [1, -1]) {
      for (let i = 0; i < 11; i++) {
        const vt = vertebra(`T${i + 1}`);
        const t = i / 11;
        const drop = 0.05 + 0.05 * t;
        const p = sample(
          spline([
            V(s * 0.026, vt.pos.y - 0.006, vt.pos.z + 0.006),
            V(s * 0.07, vt.pos.y - drop * 0.25, vt.pos.z - 0.01),
            V(s * 0.116, vt.pos.y - drop * 0.55, 0.02),
            V(s * 0.06, vt.pos.y - drop * 0.9, 0.058),
            V(s * 0.018, vt.pos.y - drop, 0.062),
          ]),
          14
        );
        parts.push(tube(p, () => 0.0016, 5));
      }
    }
    add({
      key: 'nerve:intercostal',
      layer: 'nerve',
      name: 'Intercostal nerves',
      latin: 'nn. intercostales',
      group: 'Thoracic nerves',
      region: 'thoracic',
      geometry: merge(parts),
      material: mat({ ...NERVE, opacity: 0.8, rate: 3.0, speed: 0.55, nerve: true }),
      center: V(0, 1.28, 0.02),
      span: 0.4,
      pathway: 'dorsalColumn',
      source: 'thoracic',
      // twenty-two merged tubes in one structure: heavy on screen for what it says
      opacityFactor: 0.55,
      info: { note: 'Run in the neurovascular groove between the intercostal layers, sampling rib-interval strain on every breath.' },
    });
  }

  /* ---------------- peripheral trunks ---------------- */
  for (const t of trunks()) {
    for (const s of t.bilateral ? [1, -1] : [0]) {
      const tag = s === 0 ? '' : s > 0 ? ':L' : ':R';
      const pts = sample(spline(t.path(s || 1)), Math.round((q.high ? 26 : 18) * seg));
      add({
        key: `nerve:${t.id}${tag}`,
        layer: 'nerve',
        name: s === 0 ? t.name : `${t.name} · ${s > 0 ? 'left' : 'right'}`,
        latin: t.latin,
        group: t.group,
        region: t.region,
        side: s,
        geometry: tube(pts, () => t.r, 8),
        material: mat({ ...NERVE, rate: 3.5, speed: t.speed, nerve: true }),
        center: pts[Math.floor(pts.length / 2)].clone(),
        span: 0.4,
        pathway: t.pathway,
        source: t.source,
        info: { note: t.note },
      });
    }
  }

  /* ---------------- cutaneous plexus ---------------- */
  {
    const parts = [];
    // a sparse dermal web over the trunk and limbs, giving the skin layer a visible supply
    const seeds = [
      [0, 1.3, 0.09],
      [0, 1.1, 0.095],
      [0, 1.25, -0.075],
      [0, 1.05, -0.07],
      [0.14, 1.3, 0.0],
      [-0.14, 1.3, 0.0],
      [0.24, 1.0, 0.0],
      [-0.24, 1.0, 0.0],
      [0.07, 0.6, 0.05],
      [-0.07, 0.6, 0.05],
      [0.07, 0.3, -0.04],
      [-0.07, 0.3, -0.04],
    ];
    seeds.forEach((c, si) => {
      const o = V(c[0], c[1], c[2]);
      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * Math.PI * 2 + si;
        const p = sample(
          spline([
            o,
            o.clone().add(V(Math.cos(a) * 0.024, Math.sin(a) * 0.03, 0.004)),
            o.clone().add(V(Math.cos(a + 0.5) * 0.045, Math.sin(a + 0.5) * 0.055, 0.006)),
          ]),
          6
        );
        parts.push(tube(p, (tt) => 0.0011 * (1 - 0.5 * tt), 4));
      }
    });
    add({
      key: 'nerve:cutaneous',
      layer: 'nerve',
      name: 'Cutaneous plexus',
      latin: 'plexus nervosus cutaneus',
      group: 'Peripheral endings',
      region: 'skin',
      geometry: merge(parts),
      material: mat({ ...NERVE, color: 0xffd98a, opacity: 0.6, rate: 6.0, speed: 0.8, nerve: true }),
      center: V(0, 1.15, 0.05),
      span: 0.8,
      pathway: 'dorsalColumn',
      source: 'skin',
      info: { note: 'The terminal web feeding the encapsulated endings of the dermis and the free endings of the superficial fascia.' },
    });
  }
}
