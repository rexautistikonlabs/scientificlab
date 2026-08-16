/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Continuous myofascial paths.

   These are the long-range force-transmitting tracks of the model.
   The same definition is used twice: once to draw the fascial ribbon
   you see, and once to string cables through the tensegrity network,
   so loading a path visibly redistributes along its whole length.
   ============================================================ */

import * as THREE from 'three';
import { LM, side, spineAt, trunkSurface } from './landmarks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const s = (lm, sg) => side(lm, sg);

/** Trunk surface helper: theta in degrees from the anterior midline. */
const surf = (y, deg, inset = 0.012, sg = 1) =>
  trunkSurface(y, (sg * deg * Math.PI) / 180, inset);

export const CHAINS = [
  {
    id: 'posterior',
    name: 'Superficial posterior line',
    short: 'Posterior',
    color: '#4fd6e0',
    bilateral: true,
    width: 0.036,
    blurb:
      'Plantar surface to brow in one continuous sheet. Restricting the plantar fascia raises tension as far cranial as the occiput.',
    receptors: ['ruffini', 'free', 'golgi'],
    path: (sg) => [
      V(sg * 0.056, 0.014, 0.108),
      V(sg * 0.054, 0.012, 0.03),
      V(sg * 0.052, 0.026, -0.045),
      V(sg * 0.054, 0.1, -0.05),
      V(sg * 0.058, 0.22, -0.058),
      V(sg * 0.062, 0.36, -0.05),
      V(sg * 0.062, 0.47, -0.042),
      V(sg * 0.07, 0.6, -0.05),
      V(sg * 0.075, 0.75, -0.055),
      V(sg * 0.07, 0.87, -0.058),
      V(sg * 0.05, 0.95, -0.058),
      V(sg * 0.032, 1.02, -0.055),
      V(sg * 0.03, 1.12, -0.06),
      V(sg * 0.032, 1.24, -0.068),
      V(sg * 0.032, 1.36, -0.07),
      V(sg * 0.03, 1.44, -0.058),
      V(sg * 0.026, 1.53, -0.05),
      V(sg * 0.022, 1.6, -0.075),
      V(sg * 0.018, 1.66, -0.078),
      // extra stations round the vertex: with fewer points the spline overshoots
      // the crown and the ribbon lifts off the head
      V(sg * 0.016, 1.706, -0.056),
      V(sg * 0.014, 1.734, -0.03),
      V(sg * 0.013, 1.746, 0.004),
      V(sg * 0.013, 1.732, 0.036),
      V(sg * 0.014, 1.7, 0.062),
      V(sg * 0.015, 1.665, 0.08),
    ],
  },
  {
    id: 'anterior',
    name: 'Superficial anterior line',
    short: 'Anterior',
    color: '#f0b429',
    bilateral: true,
    width: 0.034,
    blurb:
      'Dorsal foot to mastoid. Balances the posterior line; the two together set sagittal postural tone.',
    receptors: ['ruffini', 'free', 'pacinian'],
    path: (sg) => [
      V(sg * 0.058, 0.026, 0.12),
      V(sg * 0.056, 0.058, 0.062),
      V(sg * 0.056, 0.14, 0.038),
      V(sg * 0.058, 0.3, 0.038),
      V(sg * 0.058, 0.44, 0.045),
      V(sg * 0.06, 0.49, 0.052),
      V(sg * 0.066, 0.6, 0.058),
      V(sg * 0.078, 0.76, 0.068),
      V(sg * 0.082, 0.88, 0.07),
      V(sg * 0.07, 0.97, 0.075),
      V(sg * 0.05, 1.05, 0.088),
      V(sg * 0.04, 1.14, 0.092),
      V(sg * 0.032, 1.22, 0.086),
      V(sg * 0.026, 1.3, 0.084),
      V(sg * 0.022, 1.39, 0.072),
      V(sg * 0.03, 1.44, 0.062),
      V(sg * 0.048, 1.52, 0.03),
      V(sg * 0.05, 1.575, -0.012),
    ],
  },
  {
    id: 'lateral',
    name: 'Lateral line',
    short: 'Lateral',
    color: '#4fe0a0',
    bilateral: true,
    width: 0.032,
    blurb:
      'Lateral foot to mastoid, weaving across the ribs. Stabilises the frontal plane and brakes side-bending.',
    receptors: ['ruffini', 'free', 'pacinian'],
    path: (sg) => [
      V(sg * 0.08, 0.022, 0.04),
      V(sg * 0.078, 0.06, -0.01),
      V(sg * 0.086, 0.16, -0.005),
      V(sg * 0.092, 0.32, 0.0),
      V(sg * 0.098, 0.47, 0.004),
      V(sg * 0.108, 0.6, 0.006),
      V(sg * 0.116, 0.76, 0.006),
      V(sg * 0.122, 0.88, 0.004),
      V(sg * 0.128, 0.99, 0.0),
      surf(1.07, 84, 0.01, sg),
      surf(1.15, 80, 0.01, sg),
      surf(1.24, 76, 0.01, sg),
      surf(1.33, 74, 0.01, sg),
      surf(1.41, 78, 0.012, sg),
      V(sg * 0.072, 1.47, -0.012),
      V(sg * 0.06, 1.53, -0.014),
      V(sg * 0.05, 1.578, -0.016),
    ],
  },
  {
    id: 'spiral',
    name: 'Spiral line',
    short: 'Spiral',
    color: '#a58cff',
    bilateral: true,
    width: 0.03,
    blurb:
      'Wraps the trunk in a helix and crosses the midline twice. The clearest demonstration that load never stays where it is applied.',
    receptors: ['ruffini', 'free', 'spindle'],
    path: (sg) => [
      V(-sg * 0.026, 1.62, -0.068),
      V(-sg * 0.05, 1.5, -0.052),
      V(-sg * 0.09, 1.42, -0.056),
      V(-sg * 0.055, 1.35, -0.06),
      V(0, 1.3, -0.062),
      surf(1.24, 122, 0.012, sg),
      surf(1.16, 60, 0.012, sg),
      surf(1.08, 30, 0.012, sg),
      V(sg * 0.03, 1.02, 0.078),
      V(sg * 0.106, 1.008, 0.06),
      V(sg * 0.116, 0.94, 0.03),
      V(sg * 0.11, 0.8, 0.03),
      V(sg * 0.098, 0.62, 0.03),
      V(sg * 0.07, 0.49, 0.04),
      V(sg * 0.058, 0.32, 0.04),
      V(sg * 0.056, 0.14, 0.04),
      V(sg * 0.056, 0.03, 0.06),
      V(sg * 0.062, 0.018, -0.02),
      V(sg * 0.07, 0.055, -0.055),
      V(sg * 0.078, 0.2, -0.055),
      V(sg * 0.084, 0.4, -0.05),
      V(sg * 0.086, 0.55, -0.055),
      V(sg * 0.078, 0.75, -0.06),
      V(sg * 0.064, 0.88, -0.058),
    ],
  },
  {
    id: 'deepFront',
    name: 'Deep front line',
    short: 'Deep front',
    color: '#78c0ff',
    bilateral: true,
    width: 0.028,
    blurb:
      'The body’s core volume: deep plantar arch, adductors, pelvic floor, psoas, diaphragm, mediastinum, prevertebral fascia. The principal route by which posture and breathing modulate interoception.',
    receptors: ['ruffini', 'free', 'intero', 'spindle'],
    path: (sg) => [
      V(sg * 0.05, 0.016, 0.07),
      V(sg * 0.05, 0.05, 0.01),
      V(sg * 0.05, 0.16, 0.0),
      V(sg * 0.05, 0.32, 0.0),
      V(sg * 0.05, 0.47, 0.0),
      V(sg * 0.044, 0.62, 0.006),
      V(sg * 0.036, 0.78, 0.012),
      V(sg * 0.026, 0.88, 0.018),
      V(sg * 0.018, 0.93, 0.008),
      V(sg * 0.022, 0.98, -0.014),
      V(sg * 0.024, 1.06, -0.008),
      V(sg * 0.026, 1.13, 0.0),
      V(sg * 0.03, 1.19, 0.012),
      V(sg * 0.026, 1.25, 0.014),
      V(sg * 0.02, 1.32, 0.012),
      V(sg * 0.016, 1.39, 0.008),
      V(sg * 0.016, 1.45, -0.008),
      V(sg * 0.018, 1.52, -0.012),
      V(sg * 0.02, 1.565, -0.006),
    ],
  },
  {
    id: 'armFront',
    name: 'Front arm line',
    short: 'Arm front',
    color: '#ff8f6a',
    bilateral: true,
    width: 0.026,
    blurb:
      'Chest and latissimus into the flexor surface of the arm and the palm — the grip-to-trunk force path.',
    receptors: ['pacinian', 'meissner', 'golgi', 'free'],
    path: (sg) => [
      V(sg * 0.02, 1.29, 0.082),
      V(sg * 0.078, 1.34, 0.07),
      V(sg * 0.13, 1.38, 0.04),
      V(sg * 0.17, 1.38, 0.012),
      V(sg * 0.202, 1.24, 0.0),
      V(sg * 0.226, 1.09, -0.002),
      V(sg * 0.246, 0.96, 0.008),
      V(sg * 0.262, 0.845, 0.022),
      V(sg * 0.268, 0.79, 0.036),
      V(sg * 0.272, 0.73, 0.042),
      V(sg * 0.276, 0.692, 0.042),
    ],
  },
  {
    id: 'armBack',
    name: 'Back arm line',
    short: 'Arm back',
    color: '#e8506b',
    bilateral: true,
    width: 0.026,
    blurb:
      'Trapezius and rhomboids through the deltoid to the extensors and the back of the hand.',
    receptors: ['pacinian', 'ruffini', 'free'],
    path: (sg) => [
      V(sg * 0.014, 1.5, -0.05),
      V(sg * 0.062, 1.44, -0.056),
      V(sg * 0.126, 1.42, -0.048),
      V(sg * 0.174, 1.4, -0.018),
      V(sg * 0.2, 1.26, -0.024),
      V(sg * 0.226, 1.09, -0.03),
      V(sg * 0.25, 0.96, -0.018),
      V(sg * 0.264, 0.845, -0.004),
      V(sg * 0.272, 0.76, 0.008),
      V(sg * 0.278, 0.694, 0.02),
    ],
  },
  {
    id: 'functional',
    name: 'Functional line',
    short: 'Functional',
    color: '#ffd166',
    bilateral: true,
    width: 0.026,
    blurb:
      'Crosses from one shoulder to the opposite hip. Only meaningfully loaded in movement — the long lever of contralateral gait and throwing.',
    receptors: ['ruffini', 'golgi', 'free'],
    path: (sg) => [
      V(sg * 0.168, 1.39, 0.014),
      V(sg * 0.1, 1.31, 0.07),
      V(sg * 0.03, 1.19, 0.088),
      V(-sg * 0.04, 1.06, 0.086),
      V(-sg * 0.096, 0.99, 0.06),
      V(-sg * 0.102, 0.93, 0.036),
      V(-sg * 0.088, 0.82, 0.04),
      V(-sg * 0.07, 0.68, 0.044),
      V(-sg * 0.062, 0.54, 0.044),
    ],
  },
];

export const chainById = (id) => CHAINS.find((c) => c.id === id);

/** Every (chain, side) pair as a flat list of drawable instances. */
export function chainInstances() {
  const out = [];
  for (const c of CHAINS) {
    const sides = c.bilateral ? [1, -1] : [1];
    for (const sg of sides) {
      out.push({
        chain: c,
        side: sg,
        key: `chain:${c.id}:${sg > 0 ? 'L' : 'R'}`,
        label: `${c.name} · ${sg > 0 ? 'left' : 'right'}`,
        points: c.path(sg),
      });
    }
  }
  return out;
}

/** Anchor sites where a chain meets a bony landmark — these become network nodes. */
export const CHAIN_ANCHORS = {
  posterior: [0, 3, 6, 9, 12, 15, 18, 22],
  anterior: [0, 3, 6, 9, 12, 15, 17],
  lateral: [0, 3, 6, 9, 12, 15],
  spiral: [0, 4, 8, 12, 16, 20],
  deepFront: [0, 3, 6, 9, 12, 15, 18],
  armFront: [0, 3, 6, 9],
  armBack: [0, 3, 6, 9],
  functional: [0, 3, 6, 8],
};

export { s as mirror, surf as trunkPoint };
