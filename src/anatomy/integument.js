/* ============================================================
   Skin and subcutaneous tissue.

   The outer envelope, drawn as an order-independent translucent
   shell so the systems beneath stay legible. It is also the surface
   the user contacts when applying compression, and the densest
   sensory sheet in the model.
   ============================================================ */

import * as THREE from 'three';
import { loft, merge, blob, place } from './build.js';
import { trunkAxis } from './landmarks.js';
import { legStations, armStations, limbSleeve } from './fascia.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = {
  color: 0xd8a184,
  opacity: 0.16,
  rough: 0.85,
  spec: 0.12,
  rim: 0.8,
  mode: 'xray',
  doubleSide: true,
  forceAmount: 0.85,
};

const SUBQ = {
  color: 0xe8c9a0,
  opacity: 0.1,
  rough: 0.9,
  spec: 0.06,
  rim: 0.9,
  mode: 'xray',
  doubleSide: true,
};

export function buildIntegument(ctx) {
  const { add, mat, q } = ctx;

  /* ---------------- trunk & head shell ---------------- */
  const axis = trunkAxis(0.79, 1.748, q.high ? 40 : 26);
  const pts = axis.map((a) => a.pos);

  add({
    key: 'skin:trunk',
    layer: 'skin',
    name: 'Skin · trunk & head',
    latin: 'cutis',
    group: 'Integument',
    region: 'trunk',
    geometry: loft(
      pts,
      axis.map((a) => ({ a: a.sec.a, b: a.sec.b, n: a.sec.n })),
      q.high ? 40 : 26,
      { capStart: false, capEnd: false }
    ),
    material: mat(SKIN),
    center: V(0, 1.25, 0),
    span: 1.0,
    info: {
      note:
        'Four receptor classes are layered through its depth: Meissner corpuscles in the dermal papillae, Merkel complexes at the epidermal ridges, Ruffini endings in the dermal collagen and Pacinian corpuscles in the subcutis. Each reads a different part of the same contact event.',
    },
  });

  add({
    key: 'skin:subcutis',
    layer: 'skin',
    name: 'Subcutaneous fat',
    latin: 'panniculus adiposus',
    group: 'Integument',
    region: 'trunk',
    geometry: loft(
      pts,
      axis.map((a) => ({ a: a.sec.a - 0.003, b: a.sec.b - 0.003, n: a.sec.n })),
      q.high ? 30 : 20,
      { capStart: false, capEnd: false }
    ),
    material: mat(SUBQ),
    center: V(0, 1.2, 0),
    span: 1.0,
    opacityFactor: 0.45,
    info: {
      note:
        'Fat lobules held in fibrous septa, so it behaves as a structured composite rather than a soft pad. Its thickness sets how much of an external load actually reaches the deep fascia.',
    },
  });

  /* ---------------- limb sleeves ---------------- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    add({
      key: `skin:leg:${tag}`,
      layer: 'skin',
      name: `Skin · ${s > 0 ? 'left' : 'right'} lower limb`,
      latin: 'cutis',
      group: 'Integument',
      region: 'lowerLimb',
      side: s,
      geometry: limbSleeve(legStations(s), 0.0125, q),
      material: mat(SKIN),
      center: V(s * 0.07, 0.5, 0),
      span: 1.0,
    });
    add({
      key: `skin:arm:${tag}`,
      layer: 'skin',
      name: `Skin · ${s > 0 ? 'left' : 'right'} upper limb`,
      latin: 'cutis',
      group: 'Integument',
      region: 'upperLimb',
      side: s,
      geometry: limbSleeve(armStations(s), 0.011, q),
      material: mat(SKIN),
      center: V(s * 0.22, 1.1, 0),
      span: 0.8,
    });

    // hand & foot envelopes
    add({
      key: `skin:hand:${tag}`,
      layer: 'skin',
      name: `Skin · ${s > 0 ? 'left' : 'right'} hand`,
      latin: 'cutis manus',
      group: 'Integument',
      region: 'upperLimb',
      side: s,
      geometry: merge([
        place(blob(0.026, 0.034, 0.014, 12), { pos: [s * 0.267, 0.8, 0.03] }),
        place(blob(0.022, 0.03, 0.011, 10), { pos: [s * 0.272, 0.735, 0.038] }),
      ]),
      material: mat(SKIN),
      center: V(s * 0.27, 0.77, 0.033),
      span: 0.2,
      info: {
        note:
          'The fingertip pad carries the highest innervation density in the body — on the order of 2 000 endings per square centimetre — which is why two-point discrimination there is about 1 mm.',
      },
    });
    add({
      key: `skin:foot:${tag}`,
      layer: 'skin',
      name: `Skin · ${s > 0 ? 'left' : 'right'} foot`,
      latin: 'cutis pedis',
      group: 'Integument',
      region: 'lowerLimb',
      side: s,
      geometry: merge([
        place(blob(0.03, 0.028, 0.05, 12), { pos: [s * 0.053, 0.042, -0.01] }),
        place(blob(0.028, 0.019, 0.04, 12), { pos: [s * 0.056, 0.028, 0.078] }),
      ]),
      material: mat(SKIN),
      center: V(s * 0.055, 0.04, 0.02),
      span: 0.22,
      info: {
        note:
          'Plantar skin is a primary postural sensor. Its rapidly adapting endings report the moment-to-moment distribution of pressure under the foot, and that stream feeds balance directly.',
      },
    });
  }
}
