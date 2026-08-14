/* ============================================================
   Skeleton — the compression elements.

   Built as discrete pieces that never touch one another, which is
   the point: in a tensegrity reading of the body every bone is a
   spacer held in balanced tension, not a block stacked on the one
   below it.
   ============================================================ */

import * as THREE from 'three';
import { loft, tube, spline, sample, merge, place, blob } from './build.js';
import { VERTEBRAE, LM, side, ribPoints } from './landmarks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const BONE = {
  color: 0xcabfa2,
  opacity: 1,
  rough: 0.55,
  spec: 0.26,
  rim: 0.24,
  // bone is a compression element: its own strain barely changes, so it takes
  // only a muted share of the force colouring
  forceAmount: 0.5,
};

export function buildSkeleton(ctx) {
  const { add, mat, q } = ctx;
  const seg = q.high ? 1 : 0;

  /* ---------------- vertebrae ---------------- */
  for (const v of VERTEBRAE) {
    const parts = [];
    const isSacral = v.region === 'S';
    // vertebral body
    const bodyAxis = [];
    const bodyProf = [];
    const hBody = isSacral ? 0.019 : v.region === 'C' ? 0.014 : v.region === 'T' ? 0.019 : 0.026;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const waist = 1 - 0.16 * Math.sin(t * Math.PI);
      bodyAxis.push(V(v.pos.x, v.pos.y - hBody / 2 + hBody * t, v.pos.z));
      bodyProf.push({ a: v.r * waist, b: v.r * 0.84 * waist, n: 2.6 });
    }
    parts.push(loft(bodyAxis, bodyProf, 14 + seg * 6));

    if (!isSacral) {
      // neural arch: two pedicles sweeping back to a spinous process
      for (const s of [1, -1]) {
        const arch = spline(
          [
            V(v.pos.x + s * v.r * 0.7, v.pos.y, v.pos.z - v.r * 0.5),
            V(v.pos.x + s * (v.r + 0.007), v.pos.y + 0.002, v.pos.z - v.r * 1.35),
            V(v.pos.x + s * v.r * 0.62, v.pos.y + 0.001, v.pos.z - v.r * 2.1),
            V(v.pos.x + s * 0.004, v.pos.y - 0.002, v.pos.z - v.r * 2.4),
          ],
          0.5
        );
        parts.push(tube(sample(arch, 8), () => 0.0042, 7));
        // transverse process
        const tp = spline([
          V(v.pos.x + s * v.r * 0.8, v.pos.y, v.pos.z - v.r * 1.1),
          V(v.pos.x + s * (v.r + 0.014), v.pos.y + 0.002, v.pos.z - v.r * 1.3),
          V(v.pos.x + s * (v.r + 0.026), v.pos.y + 0.001, v.pos.z - v.r * 1.2),
        ]);
        parts.push(tube(sample(tp, 5), (t) => 0.0038 * (1 - 0.3 * t), 6));
      }
      // spinous process — angled caudally in the thoracic region
      const tilt = v.region === 'T' ? 0.022 : v.region === 'L' ? 0.008 : 0.012;
      const len = v.region === 'T' ? 0.03 : v.region === 'L' ? 0.026 : 0.016;
      const sp = spline([
        V(v.pos.x, v.pos.y - 0.002, v.pos.z - v.r * 2.3),
        V(v.pos.x, v.pos.y - tilt * 0.5, v.pos.z - v.r * 2.3 - len * 0.55),
        V(v.pos.x, v.pos.y - tilt, v.pos.z - v.r * 2.3 - len),
      ]);
      parts.push(tube(sample(sp, 6), (t) => 0.0055 * (1 - 0.42 * t), 7));
    } else {
      // sacral ala
      for (const s of [1, -1])
        parts.push(
          place(blob(0.022, 0.014, 0.017, 9), {
            pos: [v.pos.x + s * 0.026, v.pos.y, v.pos.z - 0.008],
          })
        );
    }

    const g = merge(parts);
    const label = isSacral ? `Sacral segment ${v.label.slice(1)}` : `${v.label} vertebra`;
    add({
      key: `bone:vert:${v.label}`,
      layer: 'bone',
      name: label,
      latin: isSacral ? 'os sacrum' : `vertebra ${v.region === 'C' ? 'cervicalis' : v.region === 'T' ? 'thoracica' : 'lumbalis'}`,
      group: isSacral ? 'Sacrum' : `${v.region === 'C' ? 'Cervical' : v.region === 'T' ? 'Thoracic' : 'Lumbar'} spine`,
      region: v.region === 'C' ? 'cervical' : v.region === 'T' ? 'thoracic' : v.region === 'L' ? 'lumbar' : 'pelvic',
      geometry: g,
      material: mat(BONE),
      center: v.pos.clone(),
      span: 0.09,
      info: {
        note: isSacral
          ? 'Suspended between the ilia in dense ligament rather than resting on them.'
          : `Motion segment ${v.label}. Load reaching it arrives through the fascial network as much as through the disc below.`,
      },
    });
  }

  /* ---------------- ribs ---------------- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    for (let i = 0; i < 12; i++) {
      const pts = ribPoints(i, s, q.high ? 26 : 18);
      const g = tube(pts, (t) => 0.0062 * (1 - 0.22 * t) * (i > 9 ? 0.82 : 1), 8);
      const mid = pts[Math.floor(pts.length / 2)];
      add({
        key: `bone:rib:${i + 1}:${tag}`,
        layer: 'bone',
        name: `Rib ${i + 1} · ${s > 0 ? 'left' : 'right'}`,
        latin: 'costa',
        group: 'Rib cage',
        region: 'thoracic',
        side: s,
        geometry: g,
        material: mat(BONE),
        center: mid.clone(),
        span: 0.2,
        info: {
          note:
            i < 7
              ? 'A true rib: articulates behind and joins the sternum in front through costal cartilage, so it forms a closed sprung ring.'
              : i < 10
                ? 'Joins the costal arch rather than the sternum — freer, and a major attachment for the abdominal wall.'
                : 'A floating rib. Its position is set almost entirely by soft-tissue tension.',
        },
      });
    }
  }

  /* ---------------- sternum ---------------- */
  {
    const axis = [LM.jugularNotch, V(0, 1.36, 0.072), LM.sternumMid, V(0, 1.25, 0.078), LM.xiphoid];
    const prof = [
      { a: 0.026, b: 0.007, n: 3 },
      { a: 0.023, b: 0.008, n: 3 },
      { a: 0.021, b: 0.008, n: 3 },
      { a: 0.017, b: 0.007, n: 3 },
      { a: 0.008, b: 0.005, n: 3 },
    ];
    add({
      key: 'bone:sternum',
      layer: 'bone',
      name: 'Sternum',
      latin: 'sternum',
      group: 'Rib cage',
      region: 'thoracic',
      geometry: loft(axis, prof, 12, { refUp: V(0, 0, 1) }),
      material: mat(BONE),
      center: LM.sternumMid.clone(),
      span: 0.24,
      info: { note: 'The anterior tie-point of the thoracic ring, and the upper anchor of the deep front line.' },
    });
  }

  /* ---------------- clavicle & scapula ---------------- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const cl = spline([
      V(s * 0.014, 1.396, 0.058),
      V(s * 0.07, 1.412, 0.046),
      V(s * 0.13, 1.418, 0.012),
      side(LM.acromion, s),
    ]);
    add({
      key: `bone:clavicle:${tag}`,
      layer: 'bone',
      name: `Clavicle · ${s > 0 ? 'left' : 'right'}`,
      latin: 'clavicula',
      group: 'Shoulder girdle',
      region: 'shoulder',
      side: s,
      geometry: tube(sample(cl, 14), (t) => 0.0072 - 0.0014 * Math.sin(t * Math.PI), 8),
      material: mat(BONE),
      center: V(s * 0.09, 1.41, 0.03),
      span: 0.2,
      info: { note: 'The only bony strut between the arm and the axial skeleton — everything else is tension.' },
    });

    // scapula: a thin plate plus spine, acromion and coracoid
    const plate = (u, v, out) => {
      // triangular sheet, curved to sit on the posterior thorax
      const x = 0.048 + u * 0.096;
      const yTop = 1.44 - u * 0.03;
      const yBot = 1.3 + u * 0.055;
      const y = yTop + (yBot - yTop) * v;
      const bulge = Math.sin(u * Math.PI) * 0.012;
      const z = -0.062 - bulge - 0.014 * (1 - v) - 0.01 * u;
      out.set(s * x, y, z);
    };
    const parts = [];
    // build the blade with a small thickness by stacking two sheets
    for (const off of [-0.0022, 0.0022]) {
      const g = sheetPlate(plate, off, s);
      parts.push(g);
    }
    const spineOfScap = spline([
      V(s * 0.052, 1.432, -0.07),
      V(s * 0.1, 1.436, -0.072),
      V(s * 0.146, 1.428, -0.05),
      side(LM.acromion, s),
    ]);
    parts.push(tube(sample(spineOfScap, 12), () => 0.0062, 7));
    parts.push(
      tube(
        sample(spline([V(s * 0.06, 1.4, -0.052), V(s * 0.082, 1.394, -0.02), V(s * 0.092, 1.392, 0.008)]), 6),
        () => 0.005,
        6
      )
    );
    add({
      key: `bone:scapula:${tag}`,
      layer: 'bone',
      name: `Scapula · ${s > 0 ? 'left' : 'right'}`,
      latin: 'scapula',
      group: 'Shoulder girdle',
      region: 'shoulder',
      side: s,
      geometry: merge(parts),
      material: mat(BONE),
      center: V(s * 0.095, 1.37, -0.066),
      span: 0.24,
      info: {
        note:
          'Held against the thorax entirely by muscle and fascia. It has no ligamentous attachment to the spine, which makes it the clearest example of a floating compression element.',
      },
    });
  }

  /* ---------------- skull ---------------- */
  {
    const parts = [];

    /* Neurocranium as a single closed loft. Station widths and depths follow adult
       craniometry: biparietal ≈ 14.5 cm, glabella-to-occiput ≈ 18.5 cm, vertex at
       1.75 m and the cranial base near 1.59 m. The occiput bulges posteriorly and
       the frontal slopes back, which is what makes the silhouette read as a skull
       rather than an egg. */
    const vaultStations = [
      // y,     halfW, halfD, zCentre
      [1.578, 0.056, 0.062, -0.006],
      [1.596, 0.066, 0.074, 0.0],
      [1.614, 0.071, 0.082, 0.002],
      [1.634, 0.0735, 0.088, 0.0],
      [1.654, 0.073, 0.09, -0.004],
      [1.676, 0.069, 0.086, -0.009],
      [1.698, 0.061, 0.076, -0.012],
      [1.718, 0.05, 0.062, -0.012],
      [1.736, 0.034, 0.043, -0.01],
      [1.748, 0.014, 0.018, -0.008],
    ];
    parts.push(
      loft(
        vaultStations.map((s) => V(0, s[0], s[3])),
        vaultStations.map((s) => ({ a: s[1], b: s[2], n: 2.15 })),
        q.high ? 26 : 18,
        { refUp: V(0, 0, 1), capStart: true, capEnd: true }
      )
    );

    /* Viscerocranium: maxilla and zygomatic arches, sitting below and in front of
       the vault so the two forms meet at the cranial base instead of crudely
       interpenetrating. */
    const faceStations = [
      [1.542, 0.03, 0.03, 0.052],
      [1.556, 0.04, 0.04, 0.056],
      [1.572, 0.048, 0.046, 0.052],
      [1.586, 0.053, 0.048, 0.042],
      [1.6, 0.055, 0.046, 0.028],
      [1.612, 0.052, 0.042, 0.012],
    ];
    parts.push(
      loft(
        faceStations.map((s) => V(0, s[0], s[3])),
        faceStations.map((s) => ({ a: s[1], b: s[2], n: 2.4 })),
        q.high ? 20 : 14,
        { refUp: V(0, 0, 1), capStart: true, capEnd: false }
      )
    );

    // orbits — two rings do more for legibility at region scale than any amount
    // of vault detail
    for (const s of [1, -1]) {
      const orbit = new THREE.TorusGeometry(0.0165, 0.0042, 6, 16);
      place(orbit, { pos: [s * 0.028, 1.606, 0.062], rot: [0.12, s * 0.24, 0] });
      parts.push(orbit);
    }
    // nasal aperture and zygomatic arches
    parts.push(tube(sample(spline([V(0, 1.606, 0.07), V(0, 1.586, 0.078), V(0, 1.566, 0.07)]), 6), () => 0.0042, 6));
    for (const s of [1, -1]) {
      parts.push(
        tube(
          sample(spline([V(s * 0.046, 1.606, 0.05), V(s * 0.056, 1.604, 0.024), V(s * 0.05, 1.6, -0.004)]), 7),
          () => 0.0045,
          6
        )
      );
    }
    add({
      key: 'bone:cranium',
      layer: 'bone',
      name: 'Cranium',
      latin: 'cranium',
      group: 'Skull',
      region: 'cranial',
      geometry: merge(parts),
      material: mat({ ...BONE, opacity: 0.94 }),
      center: V(0, 1.65, 0),
      span: 0.26,
      info: {
        note:
          'Balanced on the atlas rather than perched on it: the suboccipital tissues carry a dense spindle population that reports head position continuously.',
      },
    });
    // mandible: body plus the two ascending rami up to the joint
    const mand = spline([
      V(0.05, 1.602, -0.024),
      V(0.052, 1.572, -0.014),
      V(0.048, 1.552, 0.018),
      V(0.03, 1.542, 0.056),
      V(0, 1.539, 0.07),
      V(-0.03, 1.542, 0.056),
      V(-0.048, 1.552, 0.018),
      V(-0.052, 1.572, -0.014),
      V(-0.05, 1.602, -0.024),
    ]);
    add({
      key: 'bone:mandible',
      layer: 'bone',
      name: 'Mandible',
      latin: 'mandibula',
      group: 'Skull',
      region: 'cranial',
      geometry: tube(sample(mand, 22), (t) => 0.0082 * (0.72 + 0.28 * Math.sin(t * Math.PI)), 8),
      material: mat(BONE),
      center: V(0, 1.56, 0.04),
      span: 0.16,
      info: { note: 'Suspended in muscle; its resting position tracks cervical and hyoid tension.' },
    });
  }

  /* ---------------- pelvis ---------------- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const parts = [];
    const ilium = (u, v, out) => {
      // fan from the sacroiliac joint out to the crest and down to the acetabulum
      const crest = side(LM.iliacCrest, s);
      const asis = side(LM.asis, s);
      const hip = side(LM.hipJoint, s);
      const si = V(s * 0.016, 0.99, -0.042);
      // u: posterior → anterior along the crest, v: crest → acetabulum
      const top = new THREE.Vector3().lerpVectors(crest, asis, u);
      const bot = new THREE.Vector3().lerpVectors(si, hip, Math.pow(u, 0.75));
      out.lerpVectors(top, bot, v);
      // iliac fossa concavity
      const bow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.02;
      out.x += s * bow * 0.7;
      out.z += bow * 0.35;
    };
    for (const off of [-0.0035, 0.0035]) parts.push(sheetPlate(ilium, off, s, 12, 8));
    // ischiopubic ramus
    const ramus = spline([
      side(LM.hipJoint, s),
      V(s * 0.07, 0.882, -0.036),
      side(LM.ischium, s),
      V(s * 0.046, 0.9, 0.014),
      V(s * 0.016, 0.928, 0.046),
    ]);
    parts.push(tube(sample(ramus, 14), () => 0.0095, 8));
    // acetabular rim
    parts.push(place(blob(0.019, 0.017, 0.017, 10), { pos: [s * 0.086, 0.926, 0.004] }));
    add({
      key: `bone:ilium:${tag}`,
      layer: 'bone',
      name: `Innominate · ${s > 0 ? 'left' : 'right'}`,
      latin: 'os coxae',
      group: 'Pelvis',
      region: 'pelvic',
      side: s,
      geometry: merge(parts),
      material: mat(BONE),
      center: V(s * 0.09, 0.96, 0),
      span: 0.28,
      info: {
        note:
          'The junction box of the body: thoracolumbar fascia above, the lower-limb lines below, and the pelvic floor slung inside it.',
      },
    });
  }

  /* ---------------- long bones ---------------- */
  const longBones = [
    {
      id: 'femur',
      name: 'Femur',
      latin: 'os femoris',
      group: 'Lower limb',
      region: 'lowerLimb',
      pts: (s) => [
        V(s * 0.086, 0.926, 0.004),
        V(s * 0.096, 0.9, -0.004),
        V(s * 0.082, 0.78, 0.0),
        V(s * 0.07, 0.62, 0.006),
        V(s * 0.062, 0.5, 0.008),
      ],
      r: (t) => 0.0145 - 0.004 * Math.sin(t * Math.PI) + (t > 0.9 ? 0.006 : 0),
      note: 'Loaded in bending, not pure compression — its shaft is held in a tensioned sleeve of fascia lata and adductor septa.',
    },
    {
      id: 'tibia',
      name: 'Tibia',
      latin: 'tibia',
      group: 'Lower limb',
      region: 'lowerLimb',
      pts: (s) => [V(s * 0.058, 0.474, 0.01), V(s * 0.054, 0.34, 0.014), V(s * 0.052, 0.19, 0.006), V(s * 0.05, 0.082, -0.006)],
      r: (t) => 0.0135 - 0.0052 * Math.sin(t * Math.PI * 0.8),
      note: 'The interosseous membrane binds it to the fibula, so the two behave as one sprung unit.',
    },
    {
      id: 'fibula',
      name: 'Fibula',
      latin: 'fibula',
      group: 'Lower limb',
      region: 'lowerLimb',
      pts: (s) => [V(s * 0.084, 0.462, -0.004), V(s * 0.086, 0.33, 0.0), V(s * 0.082, 0.2, -0.004), V(s * 0.076, 0.086, -0.012)],
      r: () => 0.0055,
      note: 'Carries little axial load. It is primarily a tension anchor for the lateral line.',
    },
    {
      id: 'humerus',
      name: 'Humerus',
      latin: 'humerus',
      group: 'Upper limb',
      region: 'upperLimb',
      pts: (s) => [V(s * 0.162, 1.398, 0.004), V(s * 0.184, 1.31, -0.002), V(s * 0.206, 1.19, -0.006), V(s * 0.222, 1.094, -0.008)],
      r: (t) => 0.0125 - 0.0034 * Math.sin(t * Math.PI) + (t < 0.06 ? 0.006 : 0),
      note: 'Suspended in the rotator sleeve; the joint is a tensional balance rather than a socket bearing load.',
    },
    {
      id: 'radius',
      name: 'Radius',
      latin: 'radius',
      group: 'Upper limb',
      region: 'upperLimb',
      pts: (s) => [V(s * 0.212, 1.078, 0.004), V(s * 0.232, 0.99, 0.01), V(s * 0.25, 0.9, 0.014), V(s * 0.26, 0.846, 0.016)],
      r: (t) => 0.0058 + 0.0028 * t,
      note: 'Rotates around the ulna through the interosseous membrane, which is itself a tension element.',
    },
    {
      id: 'ulna',
      name: 'Ulna',
      latin: 'ulna',
      group: 'Upper limb',
      region: 'upperLimb',
      pts: (s) => [V(s * 0.232, 1.092, -0.014), V(s * 0.244, 1.0, -0.006), V(s * 0.258, 0.906, 0.004), V(s * 0.264, 0.848, 0.012)],
      r: (t) => 0.0072 - 0.0022 * t,
      note: 'The stable strut of the forearm; the radius moves around it.',
    },
  ];

  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    for (const b of longBones) {
      const pts = sample(spline(b.pts(s)), q.high ? 20 : 14);
      add({
        key: `bone:${b.id}:${tag}`,
        layer: 'bone',
        name: `${b.name} · ${s > 0 ? 'left' : 'right'}`,
        latin: b.latin,
        group: b.group,
        region: b.region,
        side: s,
        geometry: tube(pts, b.r, 10),
        material: mat(BONE),
        center: pts[Math.floor(pts.length / 2)].clone(),
        span: 0.3,
        info: { note: b.note },
      });
    }

    // patella
    add({
      key: `bone:patella:${tag}`,
      layer: 'bone',
      name: `Patella · ${s > 0 ? 'left' : 'right'}`,
      latin: 'patella',
      group: 'Lower limb',
      region: 'lowerLimb',
      side: s,
      geometry: place(blob(0.019, 0.021, 0.009, 12), { pos: [s * 0.062, 0.488, 0.03] }),
      material: mat(BONE),
      center: V(s * 0.062, 0.488, 0.03),
      span: 0.08,
      info: {
        note: 'A sesamoid floating inside the quadriceps tendon — a compression element formed by tension, not by articulation.',
      },
    });

    /* hand & foot: merged clusters, one structure each */
    const handParts = [];
    for (let f = 0; f < 5; f++) {
      const spread = (f - 2) * 0.0125;
      const len = f === 0 ? 0.052 : 0.072 - Math.abs(f - 2) * 0.006;
      const p = spline([
        V(s * (0.262 + spread * 0.35), 0.838, 0.018 + spread * 0.2),
        V(s * (0.268 + spread * 0.8), 0.79, 0.03 + spread * 0.3),
        V(s * (0.272 + spread), 0.79 - len, 0.038 + spread * 0.4),
      ]);
      handParts.push(tube(sample(p, 8), (t) => 0.0044 * (1 - 0.35 * t), 6));
    }
    add({
      key: `bone:hand:${tag}`,
      layer: 'bone',
      name: `Carpus & digits · ${s > 0 ? 'left' : 'right'}`,
      latin: 'ossa manus',
      group: 'Upper limb',
      region: 'upperLimb',
      side: s,
      geometry: merge(handParts),
      material: mat(BONE),
      center: side(LM.midHand, s),
      span: 0.16,
      info: { note: 'The densest tactile array in the body sits over these bones — 2 000+ endings per square centimetre at the fingertip pad.' },
    });

    const footParts = [];
    for (let f = 0; f < 5; f++) {
      const spread = (f - 2) * 0.0115;
      const p = spline([
        V(s * (0.05 + spread * 0.3), 0.052, -0.03),
        V(s * (0.054 + spread * 0.7), 0.032, 0.03),
        V(s * (0.058 + spread), 0.024, 0.096 - Math.abs(f - 2) * 0.008),
        V(s * (0.058 + spread * 1.1), 0.02, 0.122 - Math.abs(f - 2) * 0.012),
      ]);
      footParts.push(tube(sample(p, 9), (t) => 0.0052 * (1 - 0.32 * t), 6));
    }
    footParts.push(place(blob(0.018, 0.019, 0.03, 12), { pos: [s * 0.05, 0.038, -0.042] }));
    footParts.push(place(blob(0.017, 0.016, 0.02, 10), { pos: [s * 0.052, 0.058, 0.0] }));
    add({
      key: `bone:foot:${tag}`,
      layer: 'bone',
      name: `Tarsus & metatarsus · ${s > 0 ? 'left' : 'right'}`,
      latin: 'ossa pedis',
      group: 'Lower limb',
      region: 'lowerLimb',
      side: s,
      geometry: merge(footParts),
      material: mat(BONE),
      center: side(LM.midFoot, s),
      span: 0.2,
      info: {
        note:
          'The arch is a tensioned truss, held by the plantar fascia rather than wedged together. Loading the plantar surface is felt the whole way up the posterior line.',
      },
    });
  }
}

/* Thin plate helper: an offset parametric sheet with a rim, used for the flat bones. */
function sheetPlate(fn, offset, s, nu = 10, nv = 7) {
  const out = new THREE.Vector3();
  const verts = [];
  const uvs = [];
  const idx = [];
  const nrm = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = i / nu;
      const v = j / nv;
      fn(u, v, out);
      a.copy(out);
      fn(Math.min(1, u + 0.02), v, out);
      b.copy(out);
      fn(u, Math.min(1, v + 0.02), out);
      c.copy(out);
      nrm.crossVectors(b.sub(a), c.sub(a)).normalize();
      fn(u, v, out);
      out.addScaledVector(nrm, offset);
      verts.push(out.x, out.y, out.z);
      uvs.push(u, v);
    }
  }
  const row = nv + 1;
  const flip = offset * s < 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p = i * row + j;
      if (flip) idx.push(p, p + row, p + row + 1, p, p + row + 1, p + 1);
      else idx.push(p, p + row + 1, p + row, p, p + 1, p + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
