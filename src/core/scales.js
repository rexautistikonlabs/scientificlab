/* ============================================================
   Multi-scale navigation.

   The scale ladder is continuous, not stepped: the camera's view
   span is mapped through the log of the tier spans, so the tier
   readout, the LOD gates, the receptor marker size and the signal
   particle size all move smoothly as you traverse. Wheel in far
   enough and the receptor markers hand over to real micro-anatomy
   without a visible switch.
   ============================================================ */

import * as THREE from 'three';
import { SCALES } from './store.js';
import { clamp, lerp, smootherstep, formatLength, niceRound } from './util.js';
import { receptorSize, receptorsToScale } from '../anatomy/receptors.js';

const LOG_SPANS = SCALES.map((s) => Math.log(s.span));

/** Continuous tier position for a given view span (metres). */
export function tierFor(span) {
  const l = Math.log(clamp(span, 1e-6, 100));
  if (l >= LOG_SPANS[0]) return 0;
  if (l <= LOG_SPANS[LOG_SPANS.length - 1]) return LOG_SPANS.length - 1;
  for (let i = 0; i < LOG_SPANS.length - 1; i++) {
    if (l <= LOG_SPANS[i] && l >= LOG_SPANS[i + 1]) {
      const t = (LOG_SPANS[i] - l) / (LOG_SPANS[i] - LOG_SPANS[i + 1]);
      return i + t;
    }
  }
  return 0;
}

export class ScaleManager {
  constructor({ store, controls, registry, receptors, micro, signals, camera }) {
    this.store = store;
    this.controls = controls;
    this.registry = registry;
    this.receptors = receptors;
    this.micro = micro;
    this.signals = signals;
    this.camera = camera;

    this.tier = 0;
    this.lastGate = -99;
    this._microActive = null;
    this._microPos = new THREE.Vector3(0, 1.2, 0);
    this._q = new THREE.Quaternion();

    // an interesting default target per tier, used when the user jumps tiers
    // without having selected anything
    this.defaults = [
      { center: new THREE.Vector3(0, 0.95, 0), theta: 0.42, phi: Math.PI * 0.5 - 0.05 },
      { center: new THREE.Vector3(0, 1.24, 0.0), theta: 0.55, phi: Math.PI * 0.5 - 0.12 },
      { center: new THREE.Vector3(-0.02, 1.26, 0.02), theta: 0.7, phi: Math.PI * 0.5 - 0.16 },
      { center: new THREE.Vector3(0.03, 1.22, 0.05), theta: 0.9, phi: Math.PI * 0.5 - 0.2 },
      { center: new THREE.Vector3(0.03, 1.22, 0.056), theta: 1.1, phi: Math.PI * 0.5 - 0.24 },
    ];
  }

  /** Jump to a tier, keeping the current look-at when it is already useful. */
  goToTier(index, opts = {}) {
    const i = clamp(Math.round(index), 0, SCALES.length - 1);
    const def = this.defaults[i];
    const keepTarget = opts.keepTarget ?? (this.tier > 0.6 && i > 0);
    if (opts.instant) {
      this.controls.snapTo({
        target: keepTarget ? this.controls.target.clone() : def.center.clone(),
        span: SCALES[i].span,
        theta: opts.keepAngle ? undefined : def.theta,
        phi: opts.keepAngle ? undefined : def.phi,
      });
      this.update(0);
      return Promise.resolve();
    }
    return this.controls.flyTo({
      target: keepTarget ? this.controls.target.clone() : def.center.clone(),
      span: SCALES[i].span,
      theta: opts.keepAngle ? undefined : def.theta,
      phi: opts.keepAngle ? undefined : def.phi,
      duration: opts.duration ?? (Math.abs(i - this.tier) > 1.5 ? 1.9 : 1.3),
    });
  }

  /** Frame a structure, choosing the tier that suits its size. */
  focus(structure, opts = {}) {
    if (!structure) return Promise.resolve();
    const span = clamp(structure.span, 0.004, 2.1);
    this.store.focus = structure.key;
    return this.controls.flyTo({
      target: structure.center.clone(),
      span,
      theta: opts.theta,
      phi: opts.phi,
      duration: opts.duration ?? 1.5,
    });
  }

  frame(box, opts = {}) {
    if (!box) return Promise.resolve();
    return this.controls.flyTo({
      target: box.center.clone(),
      span: clamp(box.span, 0.0008, 2.4),
      duration: opts.duration ?? 1.2,
    });
  }

  update(dt) {
    const span = this.controls.span;
    const t = tierFor(span);
    this.tier = t;
    this.store.setScaleFloat(t);

    /* Progressive cutaway. Whole-body and region views stay intact; from the organ
       tier down the near plane advances toward the look-at point, so the tissue in
       front of the structure you are studying is sectioned away instead of
       obscuring it. */
    this.controls.nearFrac = lerp(0.004, 0.66, smootherstep(clamp((t - 1.35) / 0.85, 0, 1)));

    /* ---- LOD + layer weighting; re-applied only when the position moves enough
           to matter, so this is not a per-frame cost over 270 structures ---- */
    if (Math.abs(t - this.lastGate) > 0.03) {
      this.lastGate = t;
      this.registry.applyLayers(this.store, t);
    }

    /* ---- receptor marker size handover ---- */
    for (const pop of this.receptors.populations) {
      pop.material.uniforms.uSize.value = receptorSize(pop, t);
      const on = this.store.receptorFilter.has(pop.id) && this.store.effectiveOpacity('receptor') > 0.004;
      pop.mesh.visible = on;
      if (on) pop.material.uniforms.uOpacity.value = this.store.effectiveOpacity('receptor');
    }

    /* ---- signal particle scaling ---- */
    this.signals.setScale(t);

    /* ---- micro-anatomy ---- */
    const microBlend = smootherstep(clamp((t - 3.15) / 0.75, 0, 1));
    const wantMicro = microBlend > 0.01;
    this.micro.root.visible = wantMicro;
    if (wantMicro) {
      const id = this.store.microFocus;
      if (this._microActive !== id) {
        for (const [, m] of this.micro.models) m.group.visible = false;
        const m = this.micro.models.get(id);
        if (m) m.group.visible = true;
        this._microActive = id;
      }
      // sit the model at the camera's look-at point, standing upright but turned
      // to face the viewer so its internal structure reads
      this._microPos.lerp(this.controls.target, clamp(dt * 6, 0, 1));
      this.micro.root.position.copy(this._microPos);
      const dir = new THREE.Vector3().subVectors(this.camera.position, this._microPos);
      dir.y = 0;
      if (dir.lengthSq() > 1e-12) {
        const yaw = Math.atan2(dir.x, dir.z);
        this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        this.micro.root.quaternion.slerp(this._q, clamp(dt * 4, 0, 1));
      }
      const model = this.micro.models.get(this._microActive);
      if (model) {
        for (const mm of model.materials) {
          const u = mm.uniforms?.uOpacity;
          if (u) u.value = (mm.userData.baseOpacity ?? 1) * microBlend;
        }
      }
    } else if (this._microActive) {
      for (const [, m] of this.micro.models) m.group.visible = false;
      this._microActive = null;
    }
  }

  /** Scale-bar readout: a round physical length and its width in pixels. */
  bar(viewportHeight) {
    const span = this.controls.span;
    const target = span * 0.16;
    const len = niceRound(target);
    const px = (len / span) * viewportHeight;
    return { len, px, text: formatLength(len), toScale: receptorsToScale(this.tier) };
  }

  get tierLabel() {
    const i = clamp(Math.round(this.tier), 0, SCALES.length - 1);
    return SCALES[i].name;
  }
}
