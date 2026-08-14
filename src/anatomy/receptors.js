/* ============================================================
   Mechanoreceptor populations.

   Seven classes, each an instanced field seeded at the tissue sites
   where that class actually lives. Every instance is bound to a
   tensegrity node, so an ending reads the local mechanical state of
   the tissue around it and fires accordingly.

   Glyph size is exaggerated at coarse scales — a 150 µm Meissner
   corpuscle is a fraction of a pixel at whole-body view — and
   converges on true size as you descend to the receptor tier. The
   scale readout states which regime you are in.
   ============================================================ */

import * as THREE from 'three';
import { rng, clamp, lerp, smootherstep, TAU } from '../core/util.js';
import { trunkSurface, LM, side, ribPoints, VERTEBRAE } from './landmarks.js';
import { CHAINS } from './chains.js';
import { muscleTable } from './muscles.js';
import { RECEPTORS, RECEPTOR_ORDER } from './info.js';
import { receptorMaterial } from '../gfx/materials.js';
import { spline } from './build.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Per-class population sizes (scaled by quality) and their seeding strategy. */
const FIELDS = {
  pacinian: { n: 220, sites: ['subcutis', 'deepFascia', 'periosteum', 'mesentery'], size: 1.0 },
  meissner: { n: 420, sites: ['glabrous', 'skin'], size: 0.62 },
  ruffini: { n: 460, sites: ['dermis', 'deepFascia', 'retinacula', 'chains'], size: 0.8 },
  free: { n: 820, sites: ['fascia', 'periosteum', 'skin', 'viscera'], size: 0.5 },
  spindle: { n: 240, sites: ['muscle'], size: 1.5 },
  golgi: { n: 170, sites: ['tendon'], size: 1.05 },
  intero: { n: 340, sites: ['viscera', 'mesentery', 'vessel'], size: 0.7 },
};

/* ------------------------------------------------------------
   Site samplers — all deterministic
   ------------------------------------------------------------ */

function limbPoint(r, inset) {
  const which = r();
  const s = r() < 0.5 ? 1 : -1;
  const a = r() * TAU;
  if (which < 0.55) {
    // lower limb
    const t = r();
    const y = lerp(0.95, 0.09, t);
    const rad = (t < 0.5 ? 0.086 - 0.022 * (t / 0.5) : 0.062 - 0.03 * ((t - 0.5) / 0.5)) - inset;
    const cx = s * lerp(0.088, 0.05, t);
    return V(cx + Math.sin(a) * rad, y, Math.cos(a) * rad);
  }
  // upper limb
  const t = r();
  const y = lerp(1.4, 0.845, t);
  const rad = (t < 0.5 ? 0.048 - 0.008 * (t / 0.5) : 0.044 - 0.019 * ((t - 0.5) / 0.5)) - inset;
  const cx = s * lerp(0.164, 0.262, t);
  return V(cx + Math.sin(a) * rad, y, Math.cos(a) * rad);
}

function handFootPoint(r, inset) {
  const s = r() < 0.5 ? 1 : -1;
  if (r() < 0.6) {
    const p = side(LM.midHand, s).clone();
    p.x += (r() - 0.5) * 0.05;
    p.y += (r() - 0.5) * 0.11;
    p.z += 0.012 + (r() - 0.5) * 0.02 - inset;
    return p;
  }
  const p = side(LM.midFoot, s).clone();
  p.x += (r() - 0.5) * 0.05;
  p.y += (r() - 0.5) * 0.03;
  p.z += (r() - 0.5) * 0.12;
  p.y -= 0.012 - inset;
  return p;
}

function sampleSite(site, r) {
  switch (site) {
    case 'skin':
    case 'dermis': {
      const pick = r();
      if (pick < 0.45) return trunkSurface(lerp(0.9, 1.74, r()), r() * TAU, 0.004);
      if (pick < 0.78) return limbPoint(r, 0.004);
      return handFootPoint(r, 0.004);
    }
    case 'glabrous': {
      // Meissner corpuscles are concentrated in glabrous skin
      const pick = r();
      if (pick < 0.5) return handFootPoint(r, 0.002);
      if (pick < 0.7) return trunkSurface(lerp(1.5, 1.74, r()), (r() - 0.5) * 2.0, 0.002);
      if (pick < 0.88) return limbPoint(r, 0.002);
      return trunkSurface(lerp(0.95, 1.45, r()), r() * TAU, 0.002);
    }
    case 'subcutis': {
      const pick = r();
      if (pick < 0.42) return trunkSurface(lerp(0.9, 1.72, r()), r() * TAU, 0.009);
      if (pick < 0.76) return limbPoint(r, 0.01);
      return handFootPoint(r, 0.008);
    }
    case 'deepFascia':
    case 'fascia': {
      const pick = r();
      if (pick < 0.4) return trunkSurface(lerp(0.9, 1.6, r()), r() * TAU, 0.022);
      if (pick < 0.72) return limbPoint(r, 0.022);
      // fascial sheets: thoracolumbar and cervical
      if (pick < 0.86) {
        const x = (r() - 0.5) * 0.24;
        return V(x, lerp(0.95, 1.19, r()), -0.05 - Math.abs(x) * 0.05);
      }
      return V((r() - 0.5) * 0.09, lerp(1.42, 1.6, r()), -0.05);
    }
    case 'chains': {
      const c = CHAINS[Math.floor(r() * CHAINS.length) % CHAINS.length];
      const sg = r() < 0.5 ? 1 : -1;
      const pts = c.path(sg);
      const p = spline(pts, 0.5).getPoint(clamp(r(), 0.02, 0.98));
      p.x += (r() - 0.5) * 0.012;
      p.z += (r() - 0.5) * 0.012;
      return p;
    }
    case 'retinacula': {
      const s = r() < 0.5 ? 1 : -1;
      const ankle = r() < 0.5;
      const a = r() * TAU;
      const rad = ankle ? 0.03 : 0.026;
      return ankle
        ? V(s * 0.052 + Math.sin(a) * rad, 0.088 + (r() - 0.5) * 0.02, Math.cos(a) * rad * 0.8)
        : V(s * 0.262 + Math.sin(a) * rad, 0.845 + (r() - 0.5) * 0.02, 0.014 + Math.cos(a) * rad * 0.8);
    }
    case 'periosteum': {
      const pick = r();
      if (pick < 0.4) {
        const v = VERTEBRAE[Math.floor(r() * VERTEBRAE.length) % VERTEBRAE.length];
        return V(v.pos.x + (r() - 0.5) * 0.04, v.pos.y, v.pos.z - 0.02 * r());
      }
      if (pick < 0.7) {
        const s = r() < 0.5 ? 1 : -1;
        const i = Math.floor(r() * 12);
        const pts = ribPoints(i, s, 20);
        return pts[Math.floor(r() * pts.length) % pts.length].clone();
      }
      return limbPoint(r, 0.03);
    }
    case 'muscle': {
      const tbl = muscleTable().filter((m) => !m.custom);
      const m = tbl[Math.floor(r() * tbl.length) % tbl.length];
      const sg = m.bilateral ? (r() < 0.5 ? 1 : -1) : 1;
      const p = spline(m.path(sg), 0.5).getPoint(clamp(0.15 + r() * 0.7, 0, 1));
      const jr = (m.r || 0.02) * 0.6;
      p.x += (r() - 0.5) * jr;
      p.y += (r() - 0.5) * jr;
      p.z += (r() - 0.5) * jr;
      return p;
    }
    case 'tendon': {
      const tbl = muscleTable().filter((m) => !m.custom);
      const m = tbl[Math.floor(r() * tbl.length) % tbl.length];
      const sg = m.bilateral ? (r() < 0.5 ? 1 : -1) : 1;
      const t = r() < 0.5 ? 0.04 + r() * 0.06 : 0.9 + r() * 0.06;
      const p = spline(m.path(sg), 0.5).getPoint(clamp(t, 0, 1));
      p.x += (r() - 0.5) * 0.008;
      p.z += (r() - 0.5) * 0.008;
      return p;
    }
    case 'viscera': {
      const spots = [
        [-0.038, 1.184, 0.026, 0.06],
        [0.042, 1.176, 0.03, 0.04],
        [0, 1.05, 0.026, 0.06],
        [0, 1.09, 0.02, 0.07],
        [-0.02, 1.28, 0.024, 0.045],
        [0.072, 1.318, 0.0, 0.055],
        [-0.072, 1.318, 0.0, 0.055],
        [0.056, 1.13, -0.03, 0.03],
        [-0.056, 1.122, -0.03, 0.03],
        [0, 0.948, 0.034, 0.03],
      ];
      const sp = spots[Math.floor(r() * spots.length) % spots.length];
      const rad = sp[3];
      return V(sp[0] + (r() - 0.5) * rad, sp[1] + (r() - 0.5) * rad, sp[2] + (r() - 0.5) * rad);
    }
    case 'mesentery': {
      const u = r();
      const root = V(lerp(-0.02, 0.05, u), lerp(1.13, 1.02, u), -0.018);
      const edge = V(Math.sin(u * TAU * 1.2) * 0.075, lerp(1.09, 0.99, u), 0.055);
      return root.lerp(edge, r());
    }
    case 'vessel': {
      const pts = [
        [0, 1.2, -0.022],
        [0.03, 1.49, 0.008],
        [-0.03, 1.49, 0.008],
        [0.07, 0.9, 0.032],
        [-0.07, 0.9, 0.032],
        [0.012, 1.14, 0.004],
      ];
      const p = pts[Math.floor(r() * pts.length) % pts.length];
      return V(p[0] + (r() - 0.5) * 0.02, p[1] + (r() - 0.5) * 0.12, p[2] + (r() - 0.5) * 0.02);
    }
    default:
      return trunkSurface(lerp(0.9, 1.7, r()), r() * TAU, 0.01);
  }
}

/* ------------------------------------------------------------
   Glyph geometry per class
   ------------------------------------------------------------ */

function glyph(id) {
  switch (id) {
    case 'pacinian': {
      // onion-shaped: the lamellated capsule reads as an elongated bulb
      const g = new THREE.SphereGeometry(0.5, 8, 6);
      g.scale(0.62, 1, 0.62);
      return g;
    }
    case 'meissner': {
      const g = new THREE.SphereGeometry(0.5, 6, 5);
      g.scale(0.8, 1.1, 0.8);
      return g;
    }
    case 'ruffini': {
      const g = new THREE.CylinderGeometry(0.24, 0.24, 1.5, 6, 1);
      return g;
    }
    case 'free': {
      return new THREE.TetrahedronGeometry(0.6, 0);
    }
    case 'spindle': {
      const g = new THREE.CapsuleGeometry(0.22, 1.9, 3, 6);
      return g;
    }
    case 'golgi': {
      const g = new THREE.CylinderGeometry(0.3, 0.42, 1.2, 6, 1);
      return g;
    }
    case 'intero':
    default:
      return new THREE.OctahedronGeometry(0.5, 0);
  }
}

/* ------------------------------------------------------------
   Build
   ------------------------------------------------------------ */

export function buildReceptors(ctx) {
  const { registry, solver, locator, q, mkStructure } = ctx;
  const group = new THREE.Group();
  group.name = 'receptorFields';

  const populations = [];
  const tmp = [0, 0, 0];

  RECEPTOR_ORDER.forEach((id, ci) => {
    const def = RECEPTORS[id];
    const cfg = FIELDS[id];
    const count = Math.max(30, Math.round(cfg.n * (q.high ? 1 : 0.55)));
    const r = rng(9173 + ci * 7717);

    const offsets = new Float32Array(count * 3);
    const nodes = new Float32Array(count);
    const phase = new Float32Array(count);
    const scale = new Float32Array(count);
    const nodeSet = new Set();

    for (let i = 0; i < count; i++) {
      const site = cfg.sites[Math.floor(r() * cfg.sites.length) % cfg.sites.length];
      const p = sampleSite(site, r);
      offsets[i * 3] = p.x;
      offsets[i * 3 + 1] = p.y;
      offsets[i * 3 + 2] = p.z;
      const nd = locator.nearest(p.x, p.y, p.z, tmp);
      nodes[i] = nd;
      nodeSet.add(nd);
      phase[i] = r();
      scale[i] = 0.7 + r() * 0.7;
    }

    const base = glyph(id);
    const geom = new THREE.InstancedBufferGeometry();
    geom.index = base.index;
    geom.setAttribute('position', base.getAttribute('position'));
    geom.setAttribute('normal', base.getAttribute('normal'));
    geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geom.setAttribute('aNode', new THREE.InstancedBufferAttribute(nodes, 1));
    geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geom.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 1));
    geom.instanceCount = count;
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);

    const material = receptorMaterial({ color: new THREE.Color(def.color).getHex(), rate: 2, size: 0.004 });
    const mesh = new THREE.Mesh(geom, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    group.add(mesh);

    const s = mkStructure({
      key: `receptor:${id}`,
      layer: 'receptor',
      name: def.name,
      latin: def.latin,
      group: 'Sensory endings',
      region: 'multi',
      meshes: [mesh],
      nodes: [...nodeSet],
      center: V(0, 1.2, 0),
      span: 1.0,
      pickable: false,
      info: {
        receptors: [id],
        note: `${def.detects.charAt(0).toUpperCase()}${def.detects.slice(1)}. Population drawn here: ${count} of an estimated many millions.`,
        density: `${count} markers`,
      },
    });

    populations.push({
      id,
      def,
      count,
      mesh,
      material,
      structure: s,
      nodes,
      offsets,
      trueSize: def.size,
      glyphScale: cfg.size,
      nodeSet: [...nodeSet],
    });
  });

  registry.layerGroup('receptor').add(group);
  return { group, populations };
}

/**
 * Marker size in metres for the current scale tier. Coarse tiers use
 * legible markers; the receptor tier uses the real dimension.
 */
export function receptorSize(pop, scaleFloat) {
  // legible marker down to the organ tier, then a smooth handover to true scale
  const t = smootherstep(clamp((scaleFloat - 1.5) / 2.3, 0, 1));
  return lerp(0.0026 * pop.glyphScale, pop.trueSize, t);
}

/** True once markers are drawn at physical size — the readout reports this. */
export function receptorsToScale(scaleFloat) {
  return scaleFloat > 3.4;
}
