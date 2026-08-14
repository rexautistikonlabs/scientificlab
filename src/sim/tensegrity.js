/* ============================================================
   Biotensegrity network + solver.

   The model treats the body the way the biotensegrity literature
   describes it: a single pre-stressed tension network in which the
   compression elements (bone) do not touch each other. Nothing is
   a lever pivoting on a fulcrum; every element floats in balanced
   tension, so a change anywhere is a change everywhere.

   Implementation is a position-based dynamics solve:
     • cables carry tension only — they pull when stretched past
       their rest length and go slack when shortened
     • struts are near-rigid two-way distance constraints
     • every node is weakly anchored to its anatomical home, which
       stands in for the tone the rest of the body supplies
     • the solved tension field is published to a small data texture
       that every tissue shader samples, so one solve drives the
       colour and the deformation of all seven visible systems

   Node budget is kept ≤ 256 so the field fits one texture row.
   ============================================================ */

import * as THREE from 'three';
import { clamp, lerp, approach } from '../core/util.js';
import { VERTEBRAE, LM, side, ribPoints, trunkSurface } from '../anatomy/landmarks.js';
import { CHAINS, CHAIN_ANCHORS } from '../anatomy/chains.js';

export const CABLE = 0;
export const STRUT = 1;

export const MAX_NODES = 256;

/* ============================================================
   Topology
   ============================================================ */

class NetBuilder {
  constructor() {
    this.nodes = [];
    this.elements = [];
    this.byName = new Map();
  }

  node(name, pos, opts = {}) {
    const i = this.nodes.length;
    const rec = {
      i,
      name,
      pos: pos.clone(),
      region: opts.region || 'trunk',
      tissue: opts.tissue || 'bone',
      pinned: !!opts.pinned,
      mass: opts.mass ?? 1,
      driver: opts.driver || null, // physiology driver tag
    };
    this.nodes.push(rec);
    this.byName.set(name, rec);
    return rec;
  }

  /** Reuse a nearby node if one exists, otherwise make a new one. */
  nodeNear(name, pos, maxDist, opts = {}) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const n of this.nodes) {
      const d = n.pos.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best || this.node(name, pos, opts);
  }

  get(name) {
    return this.byName.get(name);
  }

  link(a, b, kind, opts = {}) {
    if (!a || !b || a === b) return null;
    const rest = a.pos.distanceTo(b.pos);
    if (rest < 1e-5) return null;
    const rec = {
      a: a.i,
      b: b.i,
      kind,
      // cables sit pre-tensioned: rest length is shorter than the built length
      pretension: opts.pretension ?? (kind === CABLE ? 0.022 : 0),
      k: opts.k ?? (kind === STRUT ? 1.0 : 0.42),
      rest0: rest,
      group: opts.group || null,
      chain: opts.chain || null,
      label: opts.label || null,
    };
    this.elements.push(rec);
    return rec;
  }

  chainLink(list, kind, opts) {
    for (let i = 0; i < list.length - 1; i++) this.link(list[i], list[i + 1], kind, opts);
  }
}

export function buildNetwork() {
  const B = new NetBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---- axial skeleton ---- */
  const vert = [];
  for (const v of VERTEBRAE) {
    const region =
      v.region === 'C' ? 'cervical' : v.region === 'T' ? 'thoracic' : v.region === 'L' ? 'lumbar' : 'pelvic';
    vert.push(B.node(`vert:${v.label}`, v.pos, { region, tissue: 'bone', driver: 'spine' }));
  }
  B.chainLink(vert, STRUT, { group: 'spine', label: 'vertebral column' });

  const cranium = B.node('skull:vertex', LM.vertex, { region: 'cranial' });
  const glabella = B.node('skull:glabella', LM.glabella, { region: 'cranial' });
  const occiput = B.node('skull:occiput', LM.occiput, { region: 'cranial' });
  const base = B.node('skull:base', V(0, 1.575, -0.012), { region: 'cranial' });
  const mast = [1, -1].map((s) =>
    B.node(`skull:mastoid:${s > 0 ? 'L' : 'R'}`, side(LM.mastoid, s), { region: 'cranial' })
  );
  for (const [a, b] of [
    [cranium, glabella],
    [cranium, occiput],
    [glabella, base],
    [occiput, base],
    [base, vert[0]],
    [occiput, vert[0]],
  ])
    B.link(a, b, STRUT, { group: 'cranium' });
  for (const m of mast) {
    B.link(m, base, STRUT, { group: 'cranium' });
    B.link(m, occiput, STRUT, { group: 'cranium' });
  }

  /* ---- rib cage ---- */
  const sternTop = B.node('sternum:notch', LM.jugularNotch, { region: 'thoracic', driver: 'ribs' });
  const sternMid = B.node('sternum:body', LM.sternumMid, { region: 'thoracic', driver: 'ribs' });
  const xiphoid = B.node('sternum:xiphoid', LM.xiphoid, { region: 'thoracic', driver: 'ribs' });
  B.chainLink([sternTop, sternMid, xiphoid], STRUT, { group: 'sternum', label: 'sternum' });

  const ribLat = [[], []];
  const ribAnt = [[], []];
  [1, -1].forEach((s, si) => {
    for (let i = 0; i < 12; i++) {
      const pts = ribPoints(i, s, 20);
      const lat = B.node(`rib:${i + 1}:lat:${s > 0 ? 'L' : 'R'}`, pts[10], {
        region: 'thoracic',
        tissue: 'bone',
        driver: 'ribs',
      });
      const ant = B.node(`rib:${i + 1}:ant:${s > 0 ? 'L' : 'R'}`, pts[20], {
        region: 'thoracic',
        tissue: 'bone',
        driver: 'ribs',
      });
      ribLat[si].push(lat);
      ribAnt[si].push(ant);
      const vt = B.get(`vert:T${i + 1}`);
      B.link(vt, lat, STRUT, { group: 'ribs', label: `rib ${i + 1}` });
      B.link(lat, ant, STRUT, { group: 'ribs', label: `rib ${i + 1}` });
      // costal cartilage / arch
      if (i < 7) B.link(ant, i < 2 ? sternTop : i < 5 ? sternMid : xiphoid, CABLE, { k: 0.72, group: 'costal' });
      // intercostal cables — the "basket weave" that makes the cage a tension structure
      if (i > 0) {
        B.link(ribLat[si][i - 1], lat, CABLE, { k: 0.34, group: 'intercostal', label: 'intercostal' });
        B.link(ribAnt[si][i - 1], ant, CABLE, { k: 0.3, group: 'intercostal', label: 'intercostal' });
        B.link(ribLat[si][i - 1], ant, CABLE, { k: 0.2, group: 'intercostal', label: 'intercostal' });
      }
    }
    // costal arch 8→10
    for (let i = 7; i < 10; i++) B.link(ribAnt[si][i], ribAnt[si][i + 1], STRUT, { k: 0.8, group: 'costal' });
    B.link(ribAnt[si][6], ribAnt[si][7], STRUT, { k: 0.8, group: 'costal' });
  });

  /* ---- shoulder girdle ---- */
  const acromion = [];
  [1, -1].forEach((s) => {
    const tag = s > 0 ? 'L' : 'R';
    const ac = B.node(`acromion:${tag}`, side(LM.acromion, s), { region: 'shoulder' });
    const supA = B.node(`scapula:sup:${tag}`, V(s * 0.09, 1.435, -0.062), { region: 'shoulder' });
    const infA = B.node(`scapula:inf:${tag}`, V(s * 0.084, 1.29, -0.076), { region: 'shoulder' });
    acromion.push(ac);
    B.link(sternTop, ac, STRUT, { group: 'clavicle', label: 'clavicle' });
    B.link(ac, supA, STRUT, { group: 'scapula', label: 'scapula' });
    B.link(supA, infA, STRUT, { group: 'scapula', label: 'scapula' });
    B.link(ac, infA, STRUT, { group: 'scapula', label: 'scapula' });
    // the scapula is slung in soft tissue, not articulated to the spine
    B.link(supA, B.get('vert:C7'), CABLE, { k: 0.4, group: 'sling', label: 'scapular sling' });
    B.link(supA, B.get('vert:T1'), CABLE, { k: 0.36, group: 'sling', label: 'scapular sling' });
    B.link(infA, B.get('vert:T4'), CABLE, { k: 0.38, group: 'sling', label: 'scapular sling' });
    B.link(infA, B.get('vert:T8'), CABLE, { k: 0.3, group: 'sling', label: 'scapular sling' });
    B.link(ac, occiput, CABLE, { k: 0.26, group: 'sling', label: 'upper trapezius' });
    B.link(ac, ribLat[s > 0 ? 0 : 1][2], CABLE, { k: 0.24, group: 'sling' });
  });

  /* ---- pelvis ---- */
  const sacrum = B.get('vert:S1');
  const coccyx = B.get('vert:S5');
  const pubis = B.node('pelvis:pubis', V(0, 0.932, 0.05), { region: 'pelvic' });
  const pelvicFloor = B.node('pelvis:floor', V(0, 0.9, -0.006), { region: 'pelvic', tissue: 'fascia' });
  const hips = [];
  [1, -1].forEach((s) => {
    const tag = s > 0 ? 'L' : 'R';
    const crest = B.node(`pelvis:crest:${tag}`, side(LM.iliacCrest, s), { region: 'pelvic' });
    const asis = B.node(`pelvis:asis:${tag}`, side(LM.asis, s), { region: 'pelvic' });
    const hip = B.node(`pelvis:hip:${tag}`, side(LM.hipJoint, s), { region: 'pelvic' });
    const isch = B.node(`pelvis:ischium:${tag}`, side(LM.ischium, s), { region: 'pelvic' });
    hips.push(hip);
    for (const [a, b] of [
      [sacrum, crest],
      [crest, asis],
      [asis, hip],
      [hip, isch],
      [isch, sacrum],
      [asis, pubis],
      [pubis, hip],
      [isch, pubis],
    ])
      B.link(a, b, STRUT, { group: 'pelvis', label: 'pelvis' });
    B.link(isch, pelvicFloor, CABLE, { k: 0.5, group: 'pelvicFloor', label: 'pelvic floor' });
    B.link(crest, B.get('vert:L3'), CABLE, { k: 0.46, group: 'tlf', label: 'thoracolumbar fascia' });
    B.link(crest, B.get('vert:L1'), CABLE, { k: 0.42, group: 'tlf', label: 'thoracolumbar fascia' });
    B.link(crest, B.get('vert:T12'), CABLE, { k: 0.36, group: 'tlf', label: 'thoracolumbar fascia' });
    B.link(crest, ribAnt[s > 0 ? 0 : 1][11], CABLE, { k: 0.34, group: 'tlf', label: 'thoracolumbar fascia' });
    B.link(crest, ribAnt[s > 0 ? 0 : 1][10], CABLE, { k: 0.3, group: 'oblique', label: 'abdominal oblique' });
    B.link(asis, ribAnt[s > 0 ? 0 : 1][9], CABLE, { k: 0.3, group: 'oblique', label: 'abdominal oblique' });
  });
  B.link(pubis, xiphoid, CABLE, { k: 0.4, group: 'rectus', label: 'rectus abdominis' });
  B.link(pelvicFloor, pubis, CABLE, { k: 0.44, group: 'pelvicFloor', label: 'pelvic floor' });
  B.link(pelvicFloor, coccyx, CABLE, { k: 0.44, group: 'pelvicFloor', label: 'pelvic floor' });

  /* ---- abdominal wall (moves with breath and motility) ---- */
  const abWall = [];
  for (const [y, sx, tag] of [
    [1.15, 0, 'upper'],
    [1.08, 0, 'mid'],
    [1.0, 0, 'lower'],
    [1.1, 0.075, 'latL'],
    [1.1, -0.075, 'latR'],
  ]) {
    const p = trunkSurface(y, Math.atan2(sx, 0.1) || 0, 0.014);
    p.x = sx;
    const n = B.node(`abwall:${tag}`, p, { region: 'abdominal', tissue: 'fascia', driver: 'abdomen', mass: 0.6 });
    abWall.push(n);
    B.link(n, B.get('vert:L3'), CABLE, { k: 0.22, group: 'abwall', label: 'abdominal wall' });
  }
  B.chainLink(abWall.slice(0, 3), CABLE, { k: 0.3, group: 'abwall', label: 'abdominal wall' });
  B.link(abWall[0], xiphoid, CABLE, { k: 0.34, group: 'abwall', label: 'abdominal wall' });
  B.link(abWall[2], pubis, CABLE, { k: 0.34, group: 'abwall', label: 'abdominal wall' });
  B.link(abWall[3], abWall[1], CABLE, { k: 0.24, group: 'abwall' });
  B.link(abWall[4], abWall[1], CABLE, { k: 0.24, group: 'abwall' });

  /* ---- diaphragm ---- */
  const diaRing = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = V(Math.sin(a) * 0.126, 1.195 + Math.cos(a * 2) * 0.004, Math.cos(a) * 0.09 + 0.004);
    diaRing.push(
      B.node(`diaphragm:ring${i}`, p, {
        region: 'thoracic',
        tissue: 'muscle',
        driver: 'diaphragm',
        mass: 0.7,
      })
    );
  }
  const diaDome = B.node('diaphragm:dome', V(0, 1.256, 0.006), {
    region: 'thoracic',
    tissue: 'muscle',
    driver: 'diaphragmDome',
    mass: 0.5,
  });
  for (let i = 0; i < 8; i++) {
    B.link(diaRing[i], diaRing[(i + 1) % 8], CABLE, { k: 0.4, group: 'diaphragm', label: 'diaphragm' });
    B.link(diaRing[i], diaDome, CABLE, { k: 0.5, group: 'diaphragm', label: 'diaphragm' });
  }
  // crura anchor the diaphragm to the upper lumbar spine — the mechanical bridge
  // between breathing and the lumbar segment
  for (const lab of ['L1', 'L2', 'L3'])
    B.link(diaRing[4], B.get(`vert:${lab}`), CABLE, { k: 0.6, group: 'crura', label: 'diaphragmatic crus' });
  B.link(diaRing[0], xiphoid, CABLE, { k: 0.5, group: 'diaphragm', label: 'central tendon' });
  for (let i = 0; i < 8; i++) {
    const s = Math.sin((i / 8) * Math.PI * 2) > 0 ? 0 : 1;
    B.link(diaRing[i], ribAnt[s][8], CABLE, { k: 0.34, group: 'diaphragm' });
    B.link(diaRing[i], ribLat[s][9], CABLE, { k: 0.3, group: 'diaphragm' });
  }
  B.link(diaDome, B.get('vert:T10'), CABLE, { k: 0.3, group: 'diaphragm' });

  /* ---- limbs ---- */
  [1, -1].forEach((s, si) => {
    const tag = s > 0 ? 'L' : 'R';
    // lower limb
    const hip = B.get(`pelvis:hip:${tag}`);
    const knee = B.node(`limb:knee:${tag}`, side(LM.knee, s), { region: 'lowerLimb' });
    const ankle = B.node(`limb:ankle:${tag}`, side(LM.ankle, s), { region: 'lowerLimb' });
    /* Ground contact is modelled as very heavy, not as immovable. A hard pin has
       infinite impedance: any load applied at the foot is absorbed by the floor
       and never reaches the rest of the network, which would silently defeat the
       one demonstration this model exists to make — that loading the plantar
       fascia raises tension as far cranial as the occiput. Heavy nodes barely move
       yet still transmit. */
    const heel = B.node(`limb:heel:${tag}`, side(LM.heel, s), { region: 'lowerLimb', mass: 26 });
    const toe = B.node(`limb:toe:${tag}`, side(LM.toeTip, s), { region: 'lowerLimb', mass: 26 });
    const midfoot = B.node(`limb:midfoot:${tag}`, side(LM.midFoot, s), { region: 'lowerLimb' });
    B.chainLink([hip, knee, ankle], STRUT, { group: 'legBone', label: 'femur / tibia' });
    B.link(ankle, heel, STRUT, { group: 'foot', label: 'tarsus' });
    B.link(ankle, midfoot, STRUT, { group: 'foot', label: 'tarsus' });
    B.link(midfoot, toe, STRUT, { group: 'foot', label: 'metatarsus' });
    B.link(heel, toe, CABLE, { k: 0.66, group: 'plantar', label: 'plantar fascia' });
    B.link(heel, midfoot, CABLE, { k: 0.5, group: 'plantar', label: 'plantar fascia' });
    // upper limb
    const ac = B.get(`acromion:${tag}`);
    const elbow = B.node(`limb:elbow:${tag}`, side(LM.elbow, s), { region: 'upperLimb' });
    const wrist = B.node(`limb:wrist:${tag}`, side(LM.wrist, s), { region: 'upperLimb' });
    const hand = B.node(`limb:hand:${tag}`, side(LM.midHand, s), { region: 'upperLimb' });
    const finger = B.node(`limb:finger:${tag}`, side(LM.fingerTip, s), { region: 'upperLimb' });
    B.chainLink([ac, elbow, wrist, hand, finger], STRUT, { group: 'armBone', label: 'humerus / forearm' });
    B.link(elbow, B.get(`scapula:inf:${tag}`), CABLE, { k: 0.3, group: 'armSling' });
  });

  /* ---- viscera: suspended, never resting on anything ---- */
  const organNodes = {};
  const organDefs = [
    ['heart', V(-0.018, 1.276, 0.028), ['vert:T6', 'diaphragm:dome', 'sternum:body'], 'cardiac'],
    ['lungL', V(0.072, 1.318, 0.0), ['vert:T4', 'rib:4:lat:L', 'diaphragm:ring2'], 'lung'],
    ['lungR', V(-0.072, 1.318, 0.0), ['vert:T4', 'rib:4:lat:R', 'diaphragm:ring6'], 'lung'],
    ['liver', V(-0.05, 1.19, 0.03), ['diaphragm:dome', 'diaphragm:ring6', 'vert:T11'], 'visceral'],
    ['stomach', V(0.05, 1.175, 0.026), ['diaphragm:ring2', 'vert:T12', 'liver'], 'visceral'],
    ['spleen', V(0.098, 1.196, -0.014), ['diaphragm:ring3', 'rib:10:lat:L'], 'visceral'],
    ['kidneyL', V(0.058, 1.13, -0.03), ['vert:L1', 'vert:L2'], 'visceral'],
    ['kidneyR', V(-0.058, 1.122, -0.03), ['vert:L1', 'vert:L2'], 'visceral'],
    ['smallInt', V(0.0, 1.05, 0.026), ['vert:L2', 'vert:L3', 'abwall:mid'], 'visceral'],
    ['colon', V(0.0, 1.09, 0.01), ['vert:L1', 'pelvis:crest:L', 'pelvis:crest:R'], 'visceral'],
    ['bladder', V(0.0, 0.945, 0.036), ['pelvis:pubis', 'pelvis:floor'], 'visceral'],
  ];
  for (const [name, pos, anchors, driver] of organDefs) {
    const n = B.node(`organ:${name}`, pos, {
      region: 'visceral',
      tissue: 'organ',
      driver,
      mass: 0.55,
    });
    organNodes[name] = n;
    for (const a of anchors) {
      const target = B.get(a) || B.get(`organ:${a}`);
      B.link(n, target, CABLE, {
        k: 0.3,
        pretension: 0.03,
        group: 'mesentery',
        label: 'visceral suspension',
      });
    }
  }

  /* ---- deep cervical region ---- */
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const m = B.get(`skull:mastoid:${tag}`);
    B.link(m, sternTop, CABLE, { k: 0.42, group: 'cervical', label: 'sternocleidomastoid' });
    B.link(m, B.get(`acromion:${tag}`), CABLE, { k: 0.3, group: 'cervical', label: 'sternocleidomastoid' });
    B.link(m, ribLat[s > 0 ? 0 : 1][0], CABLE, { k: 0.4, group: 'cervical', label: 'scalene' });
    B.link(B.get('vert:C6'), ribLat[s > 0 ? 0 : 1][0], CABLE, { k: 0.44, group: 'cervical', label: 'scalene' });
    B.link(B.get('vert:C4'), ribLat[s > 0 ? 0 : 1][1], CABLE, { k: 0.34, group: 'cervical', label: 'scalene' });
  }
  B.link(base, sternTop, CABLE, { k: 0.3, group: 'cervical', label: 'prevertebral fascia' });
  B.link(base, B.get('vert:T3'), CABLE, { k: 0.26, group: 'cervical', label: 'prevertebral fascia' });

  /* ---- paraspinal / erector cables (skip-a-segment) ---- */
  for (let i = 0; i < vert.length - 2; i++)
    B.link(vert[i], vert[i + 2], CABLE, { k: 0.3, group: 'erector', label: 'erector spinae' });
  for (let i = 0; i < vert.length - 5; i++)
    B.link(vert[i], vert[i + 5], CABLE, { k: 0.2, group: 'erector', label: 'multisegmental fascia' });

  /* ---- myofascial continuities ---- */
  for (const c of CHAINS) {
    const idxs = CHAIN_ANCHORS[c.id] || [];
    for (const sg of c.bilateral ? [1, -1] : [1]) {
      const pts = c.path(sg);
      const anchors = idxs.map((k) =>
        B.nodeNear(`chain:${c.id}:${sg > 0 ? 'L' : 'R'}:${k}`, pts[Math.min(k, pts.length - 1)], 0.055, {
          region: 'fascia',
          tissue: 'fascia',
          mass: 0.8,
        })
      );
      for (let i = 0; i < anchors.length - 1; i++)
        B.link(anchors[i], anchors[i + 1], CABLE, {
          // Stiffer than the segmental cables. These are the long-range
          // transmitters, and the stiffness ratio between them and everything
          // else is what sets how far a local load is still measurable: at 0.88 a
          // plantar load raises lumbar tension ~12 % and cranial tension ~4 %,
          // which is the order of magnitude reported for serial fascial loading.
          k: 0.88,
          pretension: 0.026,
          group: 'chain',
          chain: `${c.id}:${sg > 0 ? 'L' : 'R'}`,
          label: c.name,
        });
    }
  }

  if (B.nodes.length > MAX_NODES) {
    console.warn(`[continuum] network has ${B.nodes.length} nodes, over the ${MAX_NODES} budget`);
  }
  return { nodes: B.nodes, elements: B.elements, byName: B.byName, organNodes };
}

/* ============================================================
   Solver
   ============================================================ */

export class Tensegrity {
  constructor(net) {
    this.net = net;
    const n = (this.count = net.nodes.length);

    this.home = new Float32Array(n * 3); // anatomical reference, never modified
    this.rest = new Float32Array(n * 3); // physiology target
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.invMass = new Float32Array(n);
    this.pinned = new Uint8Array(n);
    this.load = new Float32Array(n); // normalised tension magnitude 0..~1
    this.loadRaw = new Float32Array(n);
    /* Deviation from the *resting* tension of this node, −1 (unloaded) → +1.6.
       Colour has to be referenced to rest, not to the peak: a body at its normal
       pre-tension should read as neutral everywhere, and only a genuine change
       should warm up. */
    this.dev = new Float32Array(n);
    this.baseline = new Float32Array(n);
    this.baselineReady = false;
    this.baseRms = 1;
    this._blAcc = new Float32Array(n);
    this.strainRate = new Float32Array(n);
    this._loadPrev = new Float32Array(n);
    this.pressure = new Float32Array(n); // interstitial / cavity pressure proxy
    this.stiffness = new Float32Array(n); // local stiffening from interventions
    this.viscosity = new Float32Array(n); // local viscous drag → longer time constants
    this.regionOf = new Array(n);

    net.nodes.forEach((nd, i) => {
      this.home[i * 3] = this.rest[i * 3] = this.pos[i * 3] = this.prev[i * 3] = nd.pos.x;
      this.home[i * 3 + 1] = this.rest[i * 3 + 1] = this.pos[i * 3 + 1] = this.prev[i * 3 + 1] = nd.pos.y;
      this.home[i * 3 + 2] = this.rest[i * 3 + 2] = this.pos[i * 3 + 2] = this.prev[i * 3 + 2] = nd.pos.z;
      this.invMass[i] = nd.pinned ? 0 : 1 / Math.max(0.05, nd.mass);
      this.pinned[i] = nd.pinned ? 1 : 0;
      this.regionOf[i] = nd.region;
    });

    const m = (this.elemCount = net.elements.length);
    this.ea = new Int32Array(m);
    this.eb = new Int32Array(m);
    this.ekind = new Uint8Array(m);
    this.erest0 = new Float32Array(m); // anatomical rest length
    this.erest = new Float32Array(m); // working rest length
    this.ek0 = new Float32Array(m);
    this.ek = new Float32Array(m);
    this.eten = new Float32Array(m); // signed strain × stiffness
    this.etenSm = new Float32Array(m);
    this.eLen = new Float32Array(m);

    net.elements.forEach((e, i) => {
      this.ea[i] = e.a;
      this.eb[i] = e.b;
      this.ekind[i] = e.kind;
      const r = e.rest0 * (1 - e.pretension);
      this.erest0[i] = r;
      this.erest[i] = r;
      this.ek0[i] = e.k;
      this.ek[i] = e.k;
      this.eLen[i] = e.rest0;
    });

    // adjacency for load accumulation and diffusion
    this.adjStart = new Int32Array(n + 1);
    const deg = new Int32Array(n);
    for (let i = 0; i < m; i++) {
      deg[this.ea[i]]++;
      deg[this.eb[i]]++;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.adjStart[i] = acc;
      acc += deg[i];
    }
    this.adjStart[n] = acc;
    this.adjElem = new Int32Array(acc);
    this.adjOther = new Int32Array(acc);
    const cur = this.adjStart.slice(0, n);
    for (let i = 0; i < m; i++) {
      const a = this.ea[i];
      const b = this.eb[i];
      this.adjElem[cur[a]] = i;
      this.adjOther[cur[a]++] = b;
      this.adjElem[cur[b]] = i;
      this.adjOther[cur[b]++] = a;
    }

    /* field texture: rgb = displacement from home (m), a = normalised load */
    this.fieldData = new Float32Array(MAX_NODES * 4);
    this.fieldTex = new THREE.DataTexture(this.fieldData, MAX_NODES, 1, THREE.RGBAFormat, THREE.FloatType);
    this.fieldTex.minFilter = this.fieldTex.magFilter = THREE.NearestFilter;
    this.fieldTex.wrapS = this.fieldTex.wrapT = THREE.ClampToEdgeWrapping;
    this.fieldTex.generateMipmaps = false;
    this.fieldTex.needsUpdate = true;

    /* aggregate readouts */
    this.metrics = { rms: 0, peak: 0, peakDev: 0, peakNode: -1, asymmetry: 0, work: 0 };
    this._loadNorm = 0.06;
    this.iterations = 6;
    this.gravity = -0.55;
    this.anchor = 0.055;
    this.globalTone = 0.5;
    this._interventions = [];
  }

  index(name) {
    return this.net.byName.get(name)?.i ?? -1;
  }

  nodePos(i, out = new THREE.Vector3()) {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  homePos(i, out = new THREE.Vector3()) {
    return out.set(this.home[i * 3], this.home[i * 3 + 1], this.home[i * 3 + 2]);
  }

  /** Nearest node to a world point (build-time helper — O(n), not for per-frame use). */
  nearest(p) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.count; i++) {
      const dx = p.x - this.home[i * 3];
      const dy = p.y - this.home[i * 3 + 1];
      const dz = p.z - this.home[i * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Node indices inside a sphere. */
  within(p, r) {
    const out = [];
    const r2 = r * r;
    for (let i = 0; i < this.count; i++) {
      const dx = p.x - this.home[i * 3];
      const dy = p.y - this.home[i * 3 + 1];
      const dz = p.z - this.home[i * 3 + 2];
      if (dx * dx + dy * dy + dz * dz <= r2) out.push(i);
    }
    return out;
  }

  /* ---------------- calibration ---------------- */

  /**
   * Run the network to its resting equilibrium and record that state as the
   * reference every later measurement is expressed against.
   *
   * Done synchronously at start-up with a fixed timestep rather than over the
   * first N rendered frames: the resting state of the model must be a property
   * of the model, identical on every machine, not a function of how fast the
   * first second happened to render.
   */
  settle(steps = 160, samples = 48, dt = 1 / 60) {
    for (let i = 0; i < steps; i++) this.step(dt);

    const n = this.count;
    this._blAcc.fill(0);
    let rms = 0;
    for (let k = 0; k < samples; k++) {
      this.step(dt);
      for (let i = 0; i < n; i++) this._blAcc[i] += this.loadRaw[i];
      rms += this.metrics.rms;
    }
    const inv = 1 / samples;
    for (let i = 0; i < n; i++) this.baseline[i] = Math.max(2e-4, this._blAcc[i] * inv);
    this.baseRms = Math.max(1e-5, rms * inv);
    this.baselineReady = true;
    return this;
  }

  /* ---------------- physiology hooks ---------------- */

  /** Move a node's physiology target. Called by the physiology system each frame. */
  setRest(i, x, y, z) {
    this.rest[i * 3] = x;
    this.rest[i * 3 + 1] = y;
    this.rest[i * 3 + 2] = z;
  }

  restOffset(i, dx, dy, dz) {
    this.rest[i * 3] = this.home[i * 3] + dx;
    this.rest[i * 3 + 1] = this.home[i * 3 + 1] + dy;
    this.rest[i * 3 + 2] = this.home[i * 3 + 2] + dz;
  }

  /** Global myofascial tone shortens every cable slightly. */
  setTone(tone) {
    this.globalTone = tone;
  }

  /* ---------------- interventions ---------------- */

  /**
   * Apply a mechanical intervention to a set of nodes.
   * kind: 'tension' | 'compression' | 'restriction' | 'shear' | 'release'
   */
  addIntervention({ id, kind, nodes, magnitude, center, radius, label }) {
    const rec = { id, kind, nodes: new Set(nodes), magnitude, center, radius, label, ramp: 0 };
    this._interventions.push(rec);
    return rec;
  }

  removeIntervention(id) {
    const i = this._interventions.findIndex((r) => r.id === id);
    if (i >= 0) this._interventions.splice(i, 1);
  }

  clearInterventions() {
    this._interventions.length = 0;
  }

  get interventions() {
    return this._interventions;
  }

  /** Rebuild per-element working parameters from tone + active interventions. */
  _applyModifiers(dt) {
    const m = this.elemCount;
    // reset node modifiers
    this.stiffness.fill(0);
    this.viscosity.fill(0);
    this.pressure.fill(0);

    const toneShorten = 1 - (this.globalTone - 0.5) * 0.016;

    for (let i = 0; i < m; i++) {
      this.erest[i] = this.ekind[i] === CABLE ? this.erest0[i] * toneShorten : this.erest0[i];
      this.ek[i] = this.ek0[i];
    }

    for (const iv of this._interventions) {
      iv.ramp = approach(iv.ramp, 1, 3.2, dt);
      const g = iv.magnitude * iv.ramp;
      // node-level effects
      for (const n of iv.nodes) {
        if (iv.kind === 'restriction') {
          this.stiffness[n] = Math.max(this.stiffness[n], g);
          this.viscosity[n] = Math.max(this.viscosity[n], g);
        } else if (iv.kind === 'compression') {
          this.pressure[n] = Math.max(this.pressure[n], g);
          this.stiffness[n] = Math.max(this.stiffness[n], g * 0.55);
          this.viscosity[n] = Math.max(this.viscosity[n], g * 0.7);
        } else if (iv.kind === 'tension') {
          this.stiffness[n] = Math.max(this.stiffness[n], g * 0.45);
        } else if (iv.kind === 'shear') {
          this.viscosity[n] = Math.max(this.viscosity[n], g * 0.4);
        }
      }
      // element-level effects
      for (let i = 0; i < m; i++) {
        const inA = iv.nodes.has(this.ea[i]);
        const inB = iv.nodes.has(this.eb[i]);
        if (!inA && !inB) continue;
        const w = inA && inB ? 1 : 0.5;
        const gg = g * w;
        switch (iv.kind) {
          case 'tension':
            // shorten the rest length: the element pulls harder
            this.erest[i] *= 1 - 0.075 * gg;
            this.ek[i] *= 1 + 0.5 * gg;
            break;
          case 'restriction':
            // loses extensibility: much stiffer, slightly shorter
            this.ek[i] = Math.min(1, this.ek[i] * (1 + 2.4 * gg));
            this.erest[i] *= 1 - 0.03 * gg;
            break;
          case 'compression':
            // squeezed across its axis: shortens and stiffens strongly
            this.erest[i] *= 1 - 0.055 * gg;
            this.ek[i] = Math.min(1, this.ek[i] * (1 + 1.5 * gg));
            break;
          case 'shear':
            this.ek[i] = Math.min(1, this.ek[i] * (1 + 0.8 * gg));
            break;
          case 'release':
            this.ek[i] *= 1 - 0.45 * gg;
            this.erest[i] *= 1 + 0.02 * gg;
            break;
          default:
            break;
        }
      }
    }

    // spread the local stiffening / viscosity one step along the network so the
    // affected zone has a soft edge rather than a hard boundary
    if (this._interventions.length) {
      const st = this.stiffness.slice();
      const vs = this.viscosity.slice();
      const pr = this.pressure.slice();
      for (let i = 0; i < this.count; i++) {
        let ms = st[i];
        let mv = vs[i];
        let mp = pr[i];
        for (let k = this.adjStart[i]; k < this.adjStart[i + 1]; k++) {
          const o = this.adjOther[k];
          ms = Math.max(ms, st[o] * 0.55);
          mv = Math.max(mv, vs[o] * 0.5);
          mp = Math.max(mp, pr[o] * 0.45);
        }
        this.stiffness[i] = ms;
        this.viscosity[i] = mv;
        this.pressure[i] = mp;
      }
    }
  }

  /* ---------------- step ---------------- */

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    this._applyModifiers(dt);

    const n = this.count;
    const pos = this.pos;
    const prev = this.prev;
    const rest = this.rest;

    /* --- integrate (Verlet with velocity damping) --- */
    const drag = 0.86;
    const g = this.gravity * dt * dt;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      if (!this.invMass[i]) {
        pos[i3] = rest[i3];
        pos[i3 + 1] = rest[i3 + 1];
        pos[i3 + 2] = rest[i3 + 2];
        prev[i3] = pos[i3];
        prev[i3 + 1] = pos[i3 + 1];
        prev[i3 + 2] = pos[i3 + 2];
        continue;
      }
      const vx = (pos[i3] - prev[i3]) * drag;
      const vy = (pos[i3 + 1] - prev[i3 + 1]) * drag;
      const vz = (pos[i3 + 2] - prev[i3 + 2]) * drag;
      prev[i3] = pos[i3];
      prev[i3 + 1] = pos[i3 + 1];
      prev[i3 + 2] = pos[i3 + 2];
      pos[i3] += vx;
      pos[i3 + 1] += vy + g;
      pos[i3 + 2] += vz;
    }

    /* --- constraints --- */
    const iters = this.iterations;
    for (let it = 0; it < iters; it++) {
      // weak tonic anchoring toward the physiology target
      const ak = this.anchor;
      for (let i = 0; i < n; i++) {
        if (!this.invMass[i]) continue;
        const i3 = i * 3;
        pos[i3] += (rest[i3] - pos[i3]) * ak;
        pos[i3 + 1] += (rest[i3 + 1] - pos[i3 + 1]) * ak;
        pos[i3 + 2] += (rest[i3 + 2] - pos[i3 + 2]) * ak;
      }

      for (let e = 0; e < this.elemCount; e++) {
        const a = this.ea[e];
        const b = this.eb[e];
        const wa = this.invMass[a];
        const wb = this.invMass[b];
        const w = wa + wb;
        if (w <= 0) continue;
        const a3 = a * 3;
        const b3 = b * 3;
        let dx = pos[b3] - pos[a3];
        let dy = pos[b3 + 1] - pos[a3 + 1];
        let dz = pos[b3 + 2] - pos[a3 + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-7) continue;
        const r = this.erest[e];
        const diff = L - r;
        // cables are tension-only: slack cables do nothing
        if (this.ekind[e] === CABLE && diff <= 0) {
          this.eLen[e] = L;
          continue;
        }
        const k = this.ekind[e] === STRUT ? 0.92 : this.ek[e] * 0.55;
        const corr = (diff / L) * k;
        const ca = (corr * wa) / w;
        const cb = (corr * wb) / w;
        pos[a3] += dx * ca;
        pos[a3 + 1] += dy * ca;
        pos[a3 + 2] += dz * ca;
        pos[b3] -= dx * cb;
        pos[b3 + 1] -= dy * cb;
        pos[b3 + 2] -= dz * cb;
        this.eLen[e] = L;
      }
    }

    /* --- tensions --- */
    let sum2 = 0;
    let peak = 0;
    let peakNode = -1;
    this.loadRaw.fill(0);
    const sm = 1 - Math.exp(-dt * 9);
    for (let e = 0; e < this.elemCount; e++) {
      const r = this.erest[e];
      const strain = (this.eLen[e] - r) / r;
      let t;
      if (this.ekind[e] === CABLE) t = Math.max(0, strain) * this.ek[e];
      else t = Math.abs(strain) * this.ek[e] * 0.6;
      this.eten[e] = t;
      this.etenSm[e] += (t - this.etenSm[e]) * sm;
      this.loadRaw[this.ea[e]] += t;
      this.loadRaw[this.eb[e]] += t;
      sum2 += t * t;
    }

    // one diffusion pass: force redistribution is a network property, not a
    // per-element one, and this makes the visual field continuous
    const raw = this.loadRaw;
    for (let i = 0; i < n; i++) {
      let acc = raw[i];
      let wsum = 1;
      for (let k = this.adjStart[i]; k < this.adjStart[i + 1]; k++) {
        acc += raw[this.adjOther[k]] * 0.28;
        wsum += 0.28;
      }
      const v = acc / wsum;
      if (v > peak) {
        peak = v;
        peakNode = i;
      }
      raw[i] = v;
    }

    // adaptive normalisation, so the absolute-load channel stays in range whatever
    // the tension scale happens to be
    this._loadNorm = Math.max(0.04, lerp(this._loadNorm, Math.max(peak, 0.04), 0.02));
    const inv = 1 / this._loadNorm;
    let peakDev = 0;
    for (let i = 0; i < n; i++) {
      const v = clamp(raw[i] * inv, 0, 1.6);
      const d = (v - this.load[i]) / Math.max(dt, 1e-4);
      this.strainRate[i] = this.strainRate[i] * 0.7 + d * 0.3;
      this._loadPrev[i] = this.load[i];
      this.load[i] = v;

      const b = this.baselineReady ? this.baseline[i] : Math.max(2e-4, raw[i]);
      const dv = clamp((raw[i] - b) / Math.max(b * 0.55, 0.012), -1, 1.6);
      this.dev[i] = dv;
      if (dv > peakDev) peakDev = dv;
    }
    this.metrics.peakDev = peakDev;

    // left/right asymmetry — a compact single number for the telemetry strip
    let asymL = 0;
    let asymR = 0;
    for (let i = 0; i < n; i++) {
      if (this.home[i * 3] > 0.01) asymL += raw[i];
      else if (this.home[i * 3] < -0.01) asymR += raw[i];
    }
    const tot = asymL + asymR;
    this.metrics.asymmetry = tot > 1e-6 ? (asymL - asymR) / tot : 0;
    this.metrics.rms = Math.sqrt(sum2 / Math.max(1, this.elemCount));
    this.metrics.peak = peak;
    this.metrics.peakNode = peakNode;

    this._writeField();
  }

  /**
   * Publish the solved state. rgb = displacement from the anatomical home
   * position; a = tension deviation from rest, packed as 0.5 + dev/4 so the
   * shader can recover a signed value (0.5 means "at resting pre-tension").
   */
  _writeField() {
    const f = this.fieldData;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const o = i * 4;
      f[o] = this.pos[i3] - this.home[i3];
      f[o + 1] = this.pos[i3 + 1] - this.home[i3 + 1];
      f[o + 2] = this.pos[i3 + 2] - this.home[i3 + 2];
      f[o + 3] = 0.5 + this.dev[i] * 0.25;
    }
    this.fieldTex.needsUpdate = true;
  }

  /* ---------------- sampling for downstream systems ---------------- */

  /** Local mechanical state at a node — what a receptor there would experience. */
  sample(i) {
    return {
      load: this.load[i] || 0,
      rate: this.strainRate[i] || 0,
      pressure: this.pressure[i] || 0,
      stiffness: this.stiffness[i] || 0,
      viscosity: this.viscosity[i] || 0,
    };
  }

  /** Mean load over a node set — used by the inspector. */
  meanLoad(nodes) {
    if (!nodes || !nodes.length) return 0;
    let s = 0;
    for (const i of nodes) s += this.load[i];
    return s / nodes.length;
  }

  meanOf(arr, nodes) {
    if (!nodes || !nodes.length) return 0;
    let s = 0;
    for (const i of nodes) s += arr[i];
    return s / nodes.length;
  }

  /** Positions of every element endpoint pair — for the network overlay. */
  writeLinePositions(target) {
    const m = this.elemCount;
    for (let e = 0; e < m; e++) {
      const a = this.ea[e] * 3;
      const b = this.eb[e] * 3;
      const o = e * 6;
      target[o] = this.pos[a];
      target[o + 1] = this.pos[a + 1];
      target[o + 2] = this.pos[a + 2];
      target[o + 3] = this.pos[b];
      target[o + 4] = this.pos[b + 1];
      target[o + 5] = this.pos[b + 2];
    }
  }
}
