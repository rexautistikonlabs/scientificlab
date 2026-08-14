/* ============================================================
   Body assembly.

   Builds every system in order, binds each mesh to the tension
   network, and registers it as an independently selectable
   structure. This is the only place that knows about all the
   systems at once.
   ============================================================ */

import * as THREE from 'three';
import { Registry } from './registry.js';
import { NodeLocator, bindGeometry, nodesOf } from './bind.js';
import { tissueMaterial, nerveMaterial, vesselMaterial } from '../gfx/materials.js';
import { buildSkeleton } from './skeleton.js';
import { buildMuscles } from './muscles.js';
import { buildFascia } from './fascia.js';
import { buildViscera } from './viscera.js';
import { buildNeuro } from './neuro.js';
import { buildVascular } from './vascular.js';
import { buildIntegument } from './integument.js';
import { buildReceptors } from './receptors.js';

/** Draw order: opaque cores first, then the translucent envelopes. */
const ORDER = {
  bone: 1,
  muscle: 2,
  organ: 3,
  nerve: 8,
  receptor: 9,
  arterial: 6,
  venous: 6,
  lymph: 7,
  fasciaDeep: 10,
  fasciaVisc: 10,
  chains: 11,
  fasciaSup: 12,
  skin: 14,
  network: 18,
};

/**
 * Scale visibility: which tiers each layer participates in.
 * 0 body · 1 region · 2 organ · 3 tissue · 4 receptor
 */
const SCALE_RANGE = {
  skin: [0, 3],
  fasciaSup: [0, 3],
  fasciaDeep: [0, 3],
  fasciaVisc: [0, 3],
  chains: [0, 3],
  muscle: [0, 3],
  bone: [0, 3],
  organ: [0, 3],
  nerve: [0, 3],
  arterial: [0, 3],
  venous: [0, 3],
  lymph: [0, 3],
  // only the endings survive to the deepest tier — at 900 µm every macroscopic
  // structure is larger than the frame, so drawing them just fills the view with
  // the inside of a muscle. The micro-anatomy model supplies the local context.
  receptor: [0, 4],
  network: [0, 3],
};

export async function buildBody({ solver, quality, onProgress }) {
  const registry = new Registry(solver);
  const locator = new NodeLocator(solver.home, solver.count);

  const mat = (o = {}) => {
    if (o.nerve) return nerveMaterial(o);
    if (o.vessel) return vesselMaterial(o);
    return tissueMaterial(o);
  };

  const add = (def) => {
    const geom = def.geometry;
    if (!geom) return null;
    bindGeometry(geom, locator);
    const material = def.material || mat();
    const mesh = new THREE.Mesh(geom, material);
    mesh.renderOrder = ORDER[def.layer] ?? 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const range = SCALE_RANGE[def.layer] || [0, 4];
    return registry.add({
      ...def,
      meshes: [mesh],
      material,
      nodes: def.nodes || nodesOf(geom),
      scaleMin: def.scaleMin ?? range[0],
      scaleMax: def.scaleMax ?? range[1],
    });
  };

  const ctx = {
    q: quality,
    registry,
    solver,
    locator,
    mat,
    add,
    mkStructure: (def) => registry.add(def),
  };

  const steps = [
    ['skeleton', () => buildSkeleton(ctx)],
    ['musculature', () => buildMuscles(ctx)],
    ['fascial network', () => buildFascia(ctx)],
    ['viscera', () => buildViscera(ctx)],
    ['neural pathways', () => buildNeuro(ctx)],
    ['fluid systems', () => buildVascular(ctx)],
    ['integument', () => buildIntegument(ctx)],
  ];

  for (let i = 0; i < steps.length; i++) {
    // yield to the browser between systems so the loading bar animates
    await onProgress?.(steps[i][0], i / (steps.length + 1));
    steps[i][1]();
  }

  await onProgress?.('sensory endings', steps.length / (steps.length + 1));
  const receptors = buildReceptors(ctx);

  await onProgress?.('ready', 1);
  return { registry, locator, receptors };
}
