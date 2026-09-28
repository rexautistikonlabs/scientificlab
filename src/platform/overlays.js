/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Teaching overlays — chiropractic contact regions, acupuncture
   atlas points, massage / myofascial landmarks.

   These are PLATFORM DATASETS, not baked mesh: every point binds
   to a permanent anatomical ID plus a local offset, exactly like
   an annotation, so the markers ride the live deformation and any
   future geometry rebuild re-resolves them by ID. Points whose ID
   does not resolve are REPORTED, never invented and never drawn.

   What these overlays are, and are not:

     · A teaching atlas of where several manual disciplines place
       their named landmarks on a body — so a student can relate
       those maps to the anatomy and to the live mechanical model.
     · NOT an indication, NOT a protocol, NOT treatment guidance,
       and NOT a claim that any of these points has any clinical
       effect. Selecting a massage landmark can apply a *temporary,
       clearly-labelled* mechanical load through the same
       intervention path the manual tools use — that is a physics
       demonstration on a model, nothing more.

   Symbols are shape + colour, never colour alone:
     chiropractic  slate-blue disc with a chevron
     acupuncture   jade teardrop
     massage       sand oval pad
   Overlay colours are never reused for signal traffic.
   ============================================================ */

import * as THREE from 'three';
import { clamp } from '../core/util.js';
import {
  OVERLAY_COLORS,
  overlayMarkerMaterial,
  markerHaloMaterial,
  channelDashMaterial,
  chiroGeometry,
  acuGeometry,
  massageGeometry,
} from '../gfx/anatomyMaterials.js';
import { entitlements } from './entitlements.js';
import { CHIROPRACTIC_SET } from '../data/overlays/chiropractic.js';
import { ACUPUNCTURE_SET } from '../data/overlays/acupuncture.js';
import { MASSAGE_SET } from '../data/overlays/massage.js';

export const TEACHING_SYSTEMS = {
  chiropractic: CHIROPRACTIC_SET,
  acupuncture: ACUPUNCTURE_SET,
  massage: MASSAGE_SET,
};

/** The sentence every overlay surface carries. */
export const OVERLAY_CAPTION = 'Teaching atlas. Not an indication. Not a protocol.';

const GEOMS = {
  chiropractic: chiroGeometry,
  acupuncture: acuGeometry,
  massage: massageGeometry,
};

/** Base marker radius in metres at region scale; scaled by tier below. */
const BASE_SIZE = { chiropractic: 0.008, acupuncture: 0.0062, massage: 0.011 };

/** Markers hide inward of here (they are body-scale teaching chrome). */
const HIDE_TIER = 3.35;

/** The caption every channel line carries, verbatim. */
export const CHANNEL_CAPTION = 'schematic teaching channel — not a tissue in this model';

/* Dashed schematic channel segments: ONLY between shipped atlas points of the
   same named meridian, so no path is invented. Diagram ink, not anatomy. */
const ACU_CHANNELS = [
  { meridian: 'LI', points: ['acu-li4-l', 'acu-li11-l'] },
  { meridian: 'LI', points: ['acu-li4-r', 'acu-li11-r'] },
  { meridian: 'BL', points: ['acu-bl40-l', 'acu-bl23-l'] },
  { meridian: 'BL', points: ['acu-bl40-r', 'acu-bl23-r'] },
  { meridian: 'GB', points: ['acu-gb21-l', 'acu-gb20-l'] },
  { meridian: 'GB', points: ['acu-gb21-r', 'acu-gb20-r'] },
];

export class TeachingOverlays {
  constructor({ registry, solver, store, scene }) {
    this.registry = registry;
    this.solver = solver;
    this.store = store;

    this.group = new THREE.Group();
    this.group.name = 'teachingOverlays';
    scene.add(this.group);

    /** resolved[system] = [{ point, structure, node, base:Vector3 }] */
    this.resolved = {};
    /** unresolved[system] = [pointId…] — reported, not drawn */
    this.unresolved = {};
    this.meshes = {};
    this._tmp = new THREE.Vector3();

    for (const [sysId, set] of Object.entries(TEACHING_SYSTEMS)) {
      this._resolveSystem(sysId, set);
      this._buildMesh(sysId);
    }

    /* dashed schematic channels for the acupuncture set */
    this._buildChannels();

    /* selected-point halo */
    this.halo = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.5, 40), markerHaloMaterial(0xffffff));
    this.halo.visible = false;
    this.group.add(this.halo);
    this.selected = null; // { system, index }

    this._appliedLoads = []; // temporary massage demonstrations, for one-click reset

    store.on('teachingOverlays', () => this._syncVisibility());
    this._syncVisibility();
  }

  /* ---------------- resolution ---------------- */

  _resolveSystem(sysId, set) {
    const ok = [];
    const missing = [];
    for (const p of set.points) {
      const s = this.registry.byAnatomicalId(p.anatomicalId);
      if (!s) {
        missing.push(p.id);
        continue;
      }
      const off = p.localOffset || [0, 0, 0];
      const base = s.center.clone().add(new THREE.Vector3(off[0], off[1], off[2]));
      ok.push({ point: p, structure: s, node: this.solver.nearest(base), base });
    }
    this.resolved[sysId] = ok;
    this.unresolved[sysId] = missing;
    if (missing.length) {
      // reported, never invented: an unresolvable ID is a data bug to fix, not
      // a marker to guess a position for
      console.warn(`[continuum] teaching overlay '${sysId}': ${missing.length} unresolved point(s)`, missing);
    }
  }

  _buildMesh(sysId) {
    const items = this.resolved[sysId];
    const geom = GEOMS[sysId]();
    const n = Math.max(1, items.length);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geom.index;
    inst.setAttribute('position', geom.getAttribute('position'));
    inst.setAttribute('normal', geom.getAttribute('normal'));
    const offsets = new Float32Array(n * 3);
    const scalesA = new Float32Array(n);
    const fades = new Float32Array(n);
    inst.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    inst.setAttribute('iScale', new THREE.InstancedBufferAttribute(scalesA, 1));
    inst.setAttribute('iFade', new THREE.InstancedBufferAttribute(fades, 1));
    inst.instanceCount = items.length;
    inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);

    const mesh = new THREE.Mesh(inst, overlayMarkerMaterial(OVERLAY_COLORS[sysId]));
    mesh.frustumCulled = false;
    mesh.renderOrder = 24;
    mesh.name = `overlay:${sysId}`;
    mesh.visible = false;
    mesh.userData.overlaySystem = sysId;
    this.group.add(mesh);
    this.meshes[sysId] = mesh;
  }

  _buildChannels() {
    this.channels = [];
    const byId = new Map();
    (this.resolved.acupuncture || []).forEach((it) => byId.set(it.point.id, it));
    const group = new THREE.Group();
    group.name = 'acuChannels';
    for (const ch of ACU_CHANNELS) {
      const items = ch.points.map((id) => byId.get(id)).filter(Boolean);
      if (items.length < 2) continue; // a missing point is reported, never bridged
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(items.length * 3), 3));
      geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
      const line = new THREE.Line(geom, channelDashMaterial());
      line.frustumCulled = false;
      line.renderOrder = 23;
      line.name = `channel:${ch.meridian}`;
      line.userData.caption = CHANNEL_CAPTION;
      group.add(line);
      this.channels.push({ line, items });
    }
    this.channelGroup = group;
    this.group.add(group);
  }

  _updateChannels() {
    const on = this.store.teachingOverlays.has('acupuncture');
    this.channelGroup.visible = on;
    if (!on) return;
    const s = this.solver;
    for (const ch of this.channels) {
      const pos = ch.line.geometry.getAttribute('position');
      for (let i = 0; i < ch.items.length; i++) {
        const it = ch.items[i];
        const n = it.node;
        pos.setXYZ(
          i,
          it.base.x + (s.pos[n * 3] - s.home[n * 3]),
          it.base.y + (s.pos[n * 3 + 1] - s.home[n * 3 + 1]),
          it.base.z + (s.pos[n * 3 + 2] - s.home[n * 3 + 2])
        );
      }
      pos.needsUpdate = true;
      ch.line.computeLineDistances();
    }
  }

  /* ---------------- state ---------------- */

  get activeSystems() {
    return [...this.store.teachingOverlays];
  }

  /**
   * The setOverlay contract from the brief:
   *   null | 'innervation' | 'chiropractic' | 'acupuncture' | 'massage' | 'all-teaching-points'
   * Returns the list of active teaching systems.
   */
  setOverlay(which) {
    const st = this.store;
    if (which === null || which === 'none') {
      st.setTeachingOverlays([]);
    } else if (which === 'all-teaching-points' || which === 'all') {
      st.setTeachingOverlays(Object.keys(TEACHING_SYSTEMS));
    } else if (which === 'innervation') {
      // a preset over existing layers, not a marker set: receptor fields +
      // nerve trunks + the afferent streams
      st.setLayerVisible?.('receptor', true);
      st.setLayerVisible?.('nerve', true);
      if (!st.render.signals) st.setRender('signals', true);
    } else if (TEACHING_SYSTEMS[which]) {
      st.toggleTeachingOverlay(which);
    }
    return this.activeSystems;
  }

  _syncVisibility() {
    for (const sysId of Object.keys(TEACHING_SYSTEMS)) {
      const on = this.store.teachingOverlays.has(sysId);
      this.meshes[sysId].visible = on && this._tierOK;
    }
    if (this.selected && !this.store.teachingOverlays.has(this.selected.system)) this.clearSelection();
  }

  /* ---------------- per-frame ---------------- */

  update(tier) {
    this._tier = tier;
    this._tierOK = tier < HIDE_TIER;
    const density = this.store.overlayDensity;
    const anyOn = this.store.teachingOverlays.size > 0;
    this.group.visible = anyOn && this._tierOK;
    if (!this.group.visible) {
      this.halo.visible = false;
      return;
    }

    /* At body scale the symbols cluster: only every point whose rank fits the
       density survives, and the survivors grow, so the map reads as regions
       rather than confetti. Descending past the region tier shows every point
       at true placement size. */
    const bodyScale = clamp(1 - tier * 0.85, 0, 1);
    const sizeMul = 1 + bodyScale * 1.6;
    const keep = clamp(density * (1 - bodyScale * 0.45), 0.2, 1);

    const s = this.solver;
    for (const sysId of Object.keys(TEACHING_SYSTEMS)) {
      const mesh = this.meshes[sysId];
      mesh.visible = this.store.teachingOverlays.has(sysId);
      if (!mesh.visible) continue;
      const items = this.resolved[sysId];
      const off = mesh.geometry.getAttribute('iOffset');
      const scl = mesh.geometry.getAttribute('iScale');
      const fad = mesh.geometry.getAttribute('iFade');
      const size = BASE_SIZE[sysId] * sizeMul;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const n = it.node;
        // ride the deformation: base position plus the displacement of the
        // structure's nearest network node — the annotation anchoring rule
        off.setXYZ(
          i,
          it.base.x + (s.pos[n * 3] - s.home[n * 3]),
          it.base.y + (s.pos[n * 3 + 1] - s.home[n * 3 + 1]),
          it.base.z + (s.pos[n * 3 + 2] - s.home[n * 3 + 2])
        );
        scl.setX(i, size * (it.point.scale || 1));
        // density thins deterministically by rank so the same points survive
        const rank = (i % 7) / 7;
        fad.setX(i, rank < keep ? 1 : 0);
      }
      off.needsUpdate = true;
      scl.needsUpdate = true;
      fad.needsUpdate = true;
    }

    this._updateChannels();

    /* halo follows the selected point */
    if (this.selected) {
      const it = this.resolved[this.selected.system]?.[this.selected.index];
      if (it) {
        const n = it.node;
        this.halo.position.set(
          it.base.x + (s.pos[n * 3] - s.home[n * 3]),
          it.base.y + (s.pos[n * 3 + 1] - s.home[n * 3 + 1]),
          it.base.z + (s.pos[n * 3 + 2] - s.home[n * 3 + 2])
        );
        const hs = BASE_SIZE[this.selected.system] * sizeMul * 1.4;
        this.halo.scale.setScalar(hs);
        this.halo.lookAt(this._camPos || this.halo.position.clone().add(new THREE.Vector3(0, 0, 1)));
        this.halo.visible = true;
      }
    } else {
      this.halo.visible = false;
    }
  }

  setCameraPos(v) {
    this._camPos = v;
  }

  /* ---------------- picking & selection ---------------- */

  /** Raycast targets for the main pick path — only the visible systems. */
  pickTargets() {
    return Object.values(this.meshes).filter((m) => m.visible);
  }

  /** Resolve a raycast hit on a marker mesh to its teaching point. */
  pointFromHit(hit) {
    const sysId = hit.object?.userData?.overlaySystem;
    if (!sysId) return null;
    // instanced-attribute meshes do not give instanceId on raycast reliably;
    // fall back to nearest resolved point to the hit
    let best = null;
    let bestD = Infinity;
    const items = this.resolved[sysId];
    for (let i = 0; i < items.length; i++) {
      const d = hit.point.distanceToSquared(items[i].base);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best == null ? null : { system: sysId, index: best, ...items[best] };
  }

  selectPoint(system, index) {
    const it = this.resolved[system]?.[index];
    if (!it) return null;
    this.selected = { system, index };
    return it;
  }

  clearSelection() {
    this.selected = null;
    this.halo.visible = false;
  }

  /* ---------------- massage demonstration loads ---------------- */

  /**
   * Apply a temporary, labelled mechanical load at a massage landmark through
   * the SAME intervention path the manual tools use. Gated by the intervention
   * capability; one-click reset removes everything this path applied.
   */
  applyDemonstration(it, { solverAdd, storeAdd }) {
    if (!entitlements.require('tool.intervention', { via: 'overlay.massage' })) return null;
    const id = `ovl${Date.now() % 1e7}`;
    const nodes = [];
    const r = 0.05;
    const r2 = r * r;
    const s = this.solver;
    for (let i = 0; i < s.count; i++) {
      const dx = s.home[i * 3] - it.base.x;
      const dy = s.home[i * 3 + 1] - it.base.y;
      const dz = s.home[i * 3 + 2] - it.base.z;
      if (dx * dx + dy * dy + dz * dz <= r2) nodes.push(i);
    }
    if (!nodes.length) nodes.push(it.node);
    solverAdd({ id, kind: 'restriction', nodes, magnitude: 0.5, center: it.base.clone(), radius: r, label: it.point.name });
    storeAdd({
      id,
      kind: 'restriction',
      kindName: 'Restriction',
      label: `Overlay demo · ${it.point.name}`,
      magnitude: 0.5,
      radius: r,
      nodeCount: nodes.length,
      targetIds: [it.point.anatomicalId],
    });
    this._appliedLoads.push(id);
    return id;
  }

  /** One-click reset of every demonstration load this overlay applied. */
  resetDemonstrations({ solverRemove, storeRemove }) {
    const n = this._appliedLoads.length;
    for (const id of this._appliedLoads) {
      solverRemove(id);
      storeRemove(id);
    }
    this._appliedLoads.length = 0;
    return n;
  }

  /* ---------------- reporting ---------------- */

  /** Full state for diagnostics, the panel and tests. */
  state() {
    const out = { caption: OVERLAY_CAPTION, active: this.activeSystems, systems: {} };
    for (const [sysId, set] of Object.entries(TEACHING_SYSTEMS)) {
      out.systems[sysId] = {
        name: set.name,
        source: set.source,
        resolved: this.resolved[sysId].length,
        unresolved: [...this.unresolved[sysId]],
        total: set.points.length,
      };
    }
    return out;
  }

  /** Points of one system, with live binding info, for the panel list. */
  list(sysId) {
    return (this.resolved[sysId] || []).map((it, i) => ({
      index: i,
      id: it.point.id,
      name: it.point.name,
      anatomicalId: it.point.anatomicalId,
      structure: it.structure.name,
      confidence: it.point.confidence,
      source: it.point.source,
      notes: it.point.notes,
    }));
  }
}
