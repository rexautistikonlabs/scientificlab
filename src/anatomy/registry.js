/* ============================================================
   Structure registry.

   Every selectable thing in the model registers here with its
   geometry, its layer, the network nodes it is bound to, and the
   mechanical / sensory descriptors the inspector reads. Picking,
   layer control, isolation, framing and intervention targeting all
   go through this one table.
   ============================================================ */

import * as THREE from 'three';
import { clamp, smootherstep } from '../core/util.js';

/**
 * Scale-dependent layer weighting.
 *
 * Descending into the body should reveal what you are descending toward. Rather
 * than silently rewriting the user's layer switches on every scale jump, each
 * layer carries a weight that falls off as the enveloping tissues stop being the
 * subject: skin and superficial fascia fade out by the organ tier, bone and
 * muscle thin down so you can see past them, and the interior systems keep their
 * full weight all the way in. The checkboxes still mean exactly what they say —
 * this only scales how strongly a visible layer is drawn.
 */
const SCALE_WEIGHT = {
  skin: (t) => 1 - smootherstep(clamp((t - 0.85) / 0.85, 0, 1)),
  fasciaSup: (t) => 1 - 0.92 * smootherstep(clamp((t - 1.05) / 0.85, 0, 1)),
  bone: (t) => 1 - 0.72 * smootherstep(clamp((t - 1.55) / 0.95, 0, 1)),
  muscle: (t) => 1 - 0.55 * smootherstep(clamp((t - 1.9) / 1.0, 0, 1)),
  chains: (t) => 1 - 0.55 * smootherstep(clamp((t - 1.9) / 1.0, 0, 1)),
  organ: (t) => 1 - 0.5 * smootherstep(clamp((t - 2.5) / 0.9, 0, 1)),
  // the neural tree is an orientation aid at whole-body scale but occludes badly
  // once you are inside a cavity with it
  nerve: (t) => 1 - 0.6 * smootherstep(clamp((t - 1.7) / 1.0, 0, 1)),
  arterial: (t) => 1 - 0.35 * smootherstep(clamp((t - 2.0) / 1.0, 0, 1)),
  venous: (t) => 1 - 0.35 * smootherstep(clamp((t - 2.0) / 1.0, 0, 1)),
};
const weightFor = (layer, t) => (SCALE_WEIGHT[layer] ? SCALE_WEIGHT[layer](t) : 1);

export class Structure {
  constructor(o) {
    this.key = o.key;
    this.layer = o.layer;
    this.name = o.name;
    this.latin = o.latin || '';
    this.group = o.group || null; // e.g. 'erector spinae' for grouped muscles
    this.region = o.region || 'trunk';
    this.side = o.side ?? 0; // +1 left, -1 right, 0 midline
    this.meshes = o.meshes || [];
    this.nodes = o.nodes || [];
    this.info = o.info || {};
    /** afferent routing hints, set by the neural builder */
    this.pathway = o.pathway || null;
    this.source = o.source || null;
    /** physiology driver tag, set by the visceral builder */
    this.physio = o.physio || null;
    this.center = o.center || new THREE.Vector3();
    this.span = o.span || 0.2;
    this.pickable = o.pickable !== false;
    this.opacityFactor = o.opacityFactor ?? 1;
    this.material = o.material || this.meshes[0]?.material || null;
    this.scaleMin = o.scaleMin ?? 0; // lowest scale tier at which it is drawn
    this.scaleMax = o.scaleMax ?? 4;
    this.hidden = false; // user-hidden independent of its layer
    this._hi = 0;
    this._hov = 0;
    for (const m of this.meshes) {
      m.userData.key = this.key;
      m.userData.structure = this;
    }
  }

  setUniform(name, value) {
    for (const m of this.meshes) {
      const u = m.material?.uniforms?.[name];
      if (u) u.value = value;
    }
  }

  setVisible(v) {
    for (const m of this.meshes) m.visible = v;
  }

  get visible() {
    return this.meshes.length ? this.meshes[0].visible : false;
  }
}

export class Registry {
  constructor(solver) {
    this.solver = solver;
    this.map = new Map();
    this.list = [];
    this.byLayer = new Map();
    this.root = new THREE.Group();
    this.root.name = 'anatomy';
    this.layerGroups = new Map();
    this._pickCache = null;
  }

  layerGroup(layer) {
    if (!this.layerGroups.has(layer)) {
      const g = new THREE.Group();
      g.name = layer;
      this.root.add(g);
      this.layerGroups.set(layer, g);
    }
    return this.layerGroups.get(layer);
  }

  add(def) {
    const s = def instanceof Structure ? def : new Structure(def);
    if (this.map.has(s.key)) {
      // keys must be unique — merge meshes rather than silently dropping one
      const prev = this.map.get(s.key);
      prev.meshes.push(...s.meshes);
      for (const m of s.meshes) {
        m.userData.key = prev.key;
        m.userData.structure = prev;
      }
      return prev;
    }
    this.map.set(s.key, s);
    this.list.push(s);
    if (!this.byLayer.has(s.layer)) this.byLayer.set(s.layer, []);
    this.byLayer.get(s.layer).push(s);
    const g = this.layerGroup(s.layer);
    for (const m of s.meshes) g.add(m);
    this._pickCache = null;
    return s;
  }

  get(key) {
    return this.map.get(key);
  }

  ofLayer(layer) {
    return this.byLayer.get(layer) || [];
  }

  countByLayer() {
    const out = new Map();
    for (const [k, v] of this.byLayer) out.set(k, v.length);
    return out;
  }

  /** Meshes eligible for raycasting right now. */
  pickTargets() {
    if (!this._pickCache) {
      this._pickCache = [];
      for (const s of this.list) {
        if (!s.pickable) continue;
        for (const m of s.meshes) this._pickCache.push(m);
      }
    }
    return this._pickCache.filter((m) => m.visible);
  }

  /**
   * Push layer visibility / opacity from the store into the materials.
   * Called whenever layer state, selection, or scale position changes.
   * @param {number} scaleFloat continuous scale-ladder position
   */
  applyLayers(store, scaleFloat = 0) {
    const gate = Math.round(scaleFloat);
    this.appliedScale = scaleFloat;
    for (const s of this.list) {
      const alpha = store.effectiveOpacity(s.layer) * weightFor(s.layer, scaleFloat);
      const inScale = gate >= s.scaleMin && gate <= s.scaleMax;
      const visible = alpha > 0.004 && !s.hidden && inScale;
      s.setVisible(visible);
      if (!visible) continue;
      const o = clamp(alpha * s.opacityFactor, 0, 1);
      for (const m of s.meshes) {
        const u = m.material?.uniforms;
        if (!u) continue;
        if (u.uOpacity) u.uOpacity.value = o;
        const mode = m.material.userData?.mode;
        if (mode === 'solid') {
          m.material.transparent = o < 0.995;
          m.material.depthWrite = o > 0.86;
        }
      }
    }
    this._pickCache = null;
  }

  setHighlight(key, v) {
    const s = this.map.get(key);
    if (!s) return;
    s._hi = v;
    s.setUniform('uHighlight', v);
  }

  setHover(key, v) {
    const s = this.map.get(key);
    if (!s) return;
    s._hov = v;
    s.setUniform('uHover', v);
  }

  clearHighlights() {
    for (const s of this.list) {
      if (s._hi) {
        s._hi = 0;
        s.setUniform('uHighlight', 0);
      }
      if (s._hov) {
        s._hov = 0;
        s.setUniform('uHover', 0);
      }
    }
  }

  /** Mean solved load over a structure's bound nodes. */
  loadOf(s) {
    return this.solver ? this.solver.meanLoad(s.nodes) : 0;
  }

  stateOf(s) {
    if (!this.solver || !s.nodes.length) {
      return { load: 0, rate: 0, pressure: 0, stiffness: 0, viscosity: 0 };
    }
    const sv = this.solver;
    return {
      load: sv.meanLoad(s.nodes),
      dev: sv.meanOf(sv.dev, s.nodes),
      rate: sv.meanOf(sv.strainRate, s.nodes),
      pressure: sv.meanOf(sv.pressure, s.nodes),
      stiffness: sv.meanOf(sv.stiffness, s.nodes),
      viscosity: sv.meanOf(sv.viscosity, s.nodes),
    };
  }

  /** Union bounding sphere of a set of structures — used for framing. */
  frameOf(keys) {
    const box = new THREE.Box3();
    let any = false;
    for (const k of keys) {
      const s = this.map.get(k);
      if (!s) continue;
      for (const m of s.meshes) {
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
        box.union(b);
        any = true;
      }
    }
    if (!any) return null;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { center: c, span: Math.max(size.x, size.y, size.z) * 1.7 + 0.01 };
  }

  dispose() {
    for (const s of this.list) {
      for (const m of s.meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
    }
    this.map.clear();
    this.list.length = 0;
  }
}
