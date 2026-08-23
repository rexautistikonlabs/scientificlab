/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

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
import { entitlements } from '../platform/entitlements.js';
import { clamp, lerp, smootherstep, formatLength, niceRound } from './util.js';
import { receptorSize, receptorsToScale } from '../anatomy/receptors.js';

const LOG_SPANS = SCALES.map((s) => Math.log(s.span));

/**
 * Microscope-mode thresholds on the continuous tier position.
 *
 * Deliberately asymmetric — enter deep, leave shallow. The gap is the
 * hysteresis band: inside it the mode holds whatever state it already had, so a
 * camera drifting across the boundary cannot flicker the mode.
 *
 * The entry point sits just past the Tissue tier, where the six-millimetre
 * spindle first fills a ten-millimetre view. Deeper than that the camera is
 * inside the capsule, which is a fine place to look around but a poor place to
 * *arrive*, so the mode engages on approach rather than on immersion.
 */
const MICRO_ENTER = 3.1;
const MICRO_EXIT = 2.85;

/** Layers a microscopic dive can anchor to — everything with real tissue. */
const ANCHOR_LAYERS = new Set([
  'muscle',
  'chains',
  'fasciaDeep',
  'fasciaSup',
  'fasciaVisc',
  'skin',
  'organ',
  'bone',
  'nerve',
  'arterial',
  'venous',
  'lymph',
]);

/**
 * Display amplification of the spindle's axial strain.
 *
 * The simulated excursion is around a percent, which is correct and invisible.
 * The capsule is drawn at this multiple so the motion can be seen; the strain
 * and rate figures in the read-out are never amplified. Same convention the
 * whole-body view uses for millimetre displacement.
 */
const MICRO_STRAIN_GAIN = 18;

/**
 * How much wider than the ROI the framing span is when Microscope mode opens.
 *
 * A little over one, so the subject fills the frame without touching its edges
 * and the axon leaving the ending stays on screen.
 */
const MICRO_FRAME_MARGIN = 1.75;

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
  constructor({ store, controls, registry, receptors, micro, signals, camera, spindle = null, cell = null }) {
    this.store = store;
    this.controls = controls;
    this.registry = registry;
    this.receptors = receptors;
    this.micro = micro;
    this.signals = signals;
    this.camera = camera;
    /** micro-mechanics unit driving the spindle geometry, set by main.js */
    this.spindle = spindle;
    /** the cellular-tier interior, built by anatomy/cellscape.js */
    this.cell = cell;
    this.cellBlend = 0;

    /** Where the microscope is anchored: a fixed point and the structure it
        belongs to. Set on mode entry, on selection, and when the user roams
        far enough that following them is clearly what they want. Null when
        the mode is off. */
    this._anchor = null;
    /** main.js hook: (structure|null, point) → rebinds the micro-mechanics
        unit to the structure's own network element and picks the receptor
        class that actually lives in that tissue. */
    this.onAnchor = null;

    this.tier = 0;
    this.maxTier = SCALES.length - 1;
    this.lastGate = -99;
    this._microActive = null;
    this._microPos = new THREE.Vector3(0, 1.2, 0);
    this._q = new THREE.Quaternion();
    /** cached un-scaled world extent of each micro model, metres — for framing */
    this._microExtent = new Map();
    this._box = new THREE.Box3();
    this._vec = new THREE.Vector3();

    // an interesting default target per tier, used when the user jumps tiers
    // without having selected anything
    this.defaults = [
      { center: new THREE.Vector3(0, 0.95, 0), theta: 0.42, phi: Math.PI * 0.5 - 0.05 },
      { center: new THREE.Vector3(0, 1.24, 0.0), theta: 0.55, phi: Math.PI * 0.5 - 0.12 },
      { center: new THREE.Vector3(-0.02, 1.26, 0.02), theta: 0.7, phi: Math.PI * 0.5 - 0.16 },
      { center: new THREE.Vector3(0.03, 1.22, 0.05), theta: 0.9, phi: Math.PI * 0.5 - 0.2 },
      { center: new THREE.Vector3(0.03, 1.22, 0.056), theta: 1.1, phi: Math.PI * 0.5 - 0.24 },
      { center: new THREE.Vector3(0.03, 1.22, 0.056), theta: 1.25, phi: Math.PI * 0.5 - 0.2 },
    ];
    this._resolveDeepDefaults();
  }

  /**
   * Point the two deepest default framings at a structure that actually exists.
   *
   * The literals above are fine down to the organ tier, where a centimetre of
   * error is a small fraction of the view. At a twelve-millimetre span it is the
   * whole frame, and the tissue-tier literal was doing exactly that: it sat just
   * outside the anterior trunk, with no structure within three centimetres and no
   * receptor ending within twelve millimetres, so jumping to that tier showed a
   * black field with a few coloured glyphs in it. Resolving through the registry
   * means the framing follows the geometry instead of a coordinate that was
   * correct when it was typed.
   *
   * The scalene region is the preferred subject because it is the densest tissue
   * neighbourhood in the model — cervical vertebrae, cord, roots, deep fascia,
   * muscle and several receptor classes within a few millimetres — and because it
   * is where the deep cervical fascia demonstration takes place.
   */
  _resolveDeepDefaults() {
    const preferred = ['muscle:scalene:R', 'muscle:scalene:L', 'organ:kidney:L', 'bone:vert:C6'];
    for (const key of preferred) {
      const s = this.registry?.get?.(key);
      if (!s) continue;
      this.defaults[3].center.copy(s.center);
      this.defaults[4].center.copy(s.center);
      this.defaults[5].center.copy(s.center);
      return;
    }
  }

  /**
   * Re-read the licence and clamp how far the camera may travel. Called at
   * start-up and whenever the tier changes. The floor is a real constraint on
   * the controller, so a free-tier user cannot reach a premium scale by wheel,
   * pinch, keyboard, or by calling goToTier directly.
   */
  applyEntitlements() {
    const maxTier = entitlements.maxScaleTier();
    this.maxTier = maxTier;
    if (maxTier >= SCALES.length - 1) {
      // one step past the Cell tier's nominal span — inside the cell, then stop
      this.controls.minDist = 0.000022;
      return;
    }
    // a little past the deepest allowed tier, so that tier is comfortable to sit in
    this.controls.setMinSpan(SCALES[maxTier].span * 0.92);
  }

  /** Jump to a tier, keeping the current look-at when it is already useful. */
  goToTier(index, opts = {}) {
    let i = clamp(Math.round(index), 0, SCALES.length - 1);
    if (i > this.maxTier) {
      entitlements.require(i >= 5 ? 'scale.cellular' : 'scale.deep', { tier: SCALES[i].id });
      i = this.maxTier;
    }
    const def = this.defaults[i];
    /* Judged from the live camera span, not from the tier cached by the last
       update: "snap to a structure, then jump deep" in one frame is a real
       user path (double-click, then a tier key), and the cached tier still
       said whole-body — which threw the kept target away and sent the dive to
       the deep default instead of the structure the user just chose. */
    const keepTarget = opts.keepTarget ?? (tierFor(this.controls.span) > 0.6 && i > 0);
    /* A deep jump with an explicit selection goes to the SELECTION — the user
       has named a target, and landing on the build-time default site instead
       is the single most disorienting thing this navigation used to do. */
    const sel =
      !keepTarget && i >= 3 && this.store.selection.size === 1
        ? this.registry.get([...this.store.selection][0])
        : null;
    const center = keepTarget ? this.controls.target.clone() : (sel ? sel.center.clone() : def.center.clone());
    if (opts.instant) {
      this.controls.snapTo({
        target: center,
        span: SCALES[i].span,
        theta: opts.keepAngle ? undefined : def.theta,
        phi: opts.keepAngle ? undefined : def.phi,
      });
      this.update(0);
      return Promise.resolve();
    }
    return this.controls.flyTo({
      target: center,
      span: SCALES[i].span,
      theta: opts.keepAngle ? undefined : def.theta,
      phi: opts.keepAngle ? undefined : def.phi,
      duration: opts.duration ?? (Math.abs(i - this.tier) > 1.5 ? 1.9 : 1.3),
    });
  }

  /** Frame a structure, choosing the tier that suits its size. */
  focus(structure, opts = {}) {
    if (!structure) return Promise.resolve();
    if (!entitlements.require('camera.freeFly', { key: structure.key })) return Promise.resolve();
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

    /* The cellular handover: past the receptor tier the cell interior fades in
       and the receptor scene yields — a crossfade, not a switch, so the descent
       reads as one continuous dive rather than a scene change. Computed here
       because the receptor markers below also need it. */
    this.cellBlend = this.cell ? smootherstep(clamp((t - 4.25) / 0.6, 0, 1)) : 0;

    /* Progressive cutaway. Whole-body and region views stay intact; from the organ
       tier down the near plane advances toward the look-at point, so the tissue in
       front of the structure you are studying is sectioned away instead of
       obscuring it. At the cellular tier it advances further still — past the
       front of the plasma membrane — which is what opens the cell like an
       optical section instead of showing a closed envelope. */
    this.controls.nearFrac =
      lerp(0.004, 0.66, smootherstep(clamp((t - 1.35) / 0.85, 0, 1))) +
      0.24 * smootherstep(clamp((t - 4.2) / 0.7, 0, 1));

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
      if (on) {
        /* The glyphs are exaggerated markers, and at whole-body view a thousand
           of them at full weight read as confetti scattered over the figure.
           Fade them up as the scale approaches the tissues they live in — the
           switch itself still belongs to the user; this only weights it.
           Inside Microscope mode they nearly vanish: the modelled ending is the
           subject there, and an exaggerated marker pill at a sub-millimetre
           span is a wall in front of it. */
        const focus = lerp(0.3, 1, smootherstep(clamp((t - 0.7) / 1.5, 0, 1)));
        const inMicro = this.store.micro.active ? 0.12 : 1;
        // and gone entirely inside the cell — an exaggerated marker is metres
        // of wall at a forty-micron span
        pop.material.uniforms.uOpacity.value =
          this.store.effectiveOpacity('receptor') * focus * inMicro * (1 - this.cellBlend);
      }
    }

    /* ---- signal particle scaling ---- */
    this.signals.setScale(t);

    /* ---- Microscope mode latch ----
       Two different thresholds, deliberately. A single threshold sitting under a
       slowly orbiting camera toggles the whole mode — caption, read-out, ROI
       framing — on and off several times a second. Entering deeper than leaving
       means the mode is sticky once you are inside it. An explicit pin overrides
       distance entirely, and is only released by pulling back past the exit. */
    const m = this.store.micro;
    const wasActive = m.active;
    if (m.pinned) {
      if (t < MICRO_EXIT - 0.25) {
        m.pinned = false;
        m.active = false;
        this.store.emit('micro', 'auto');
      } else if (!m.active) {
        m.active = true;
        this.store.emit('micro', 'auto');
      }
    } else {
      const want = m.active ? t > MICRO_EXIT : t > MICRO_ENTER;
      if (want !== m.active) {
        m.active = want;
        this.store.emit('micro', 'auto');
      }
    }
    if (m.active && !wasActive) {
      /* Anchor at the flight's DESTINATION, not at the interpolating look-at
         point: a continuous dive crosses the microscope threshold mid-flight,
         and anchoring to a point the camera is merely passing through leaves
         the subject off-frame when the flight lands. */
      this._setAnchor(this.controls.destinationTarget());
      this._frameMicroSubject();
    }
    if (!m.active && wasActive) this._anchor = null;

    /* ---- micro-anatomy ----
       The blend leads the mode: it starts a third of the way through the Tissue
       tier, so the fascicle bed and the ending materialise while you are still
       descending — the tissue tier shows tissue instead of the empty gap that
       used to sit between the organ view and the receptor view. */
    const microBlend = smootherstep(clamp((t - 2.65) / 0.65, 0, 1));
    const cellBlend = this.cellBlend;
    const wantMicro = microBlend > 0.01 || this.store.micro.active;
    this.micro.root.visible = wantMicro;
    if (wantMicro) {
      const id = this.store.microFocus;
      if (this._microActive !== id) {
        for (const [, m] of this.micro.models) m.group.visible = false;
        const m = this.micro.models.get(id);
        if (m) m.group.visible = true;
        const refit = this._microActive !== null && this.store.micro.active;
        this._microActive = id;
        /* Each class has its own physical size — a Pacinian corpuscle is a
           sixth of a spindle. Left at the previous subject's framing, a smaller
           ending is a speck; re-frame on the switch, exactly as on entry. */
        if (refit) this._frameMicroSubject(true);
      }
      /* The subject sits at the ANCHOR, not at the live look-at point, and it
         faced the camera exactly once — at anchor time. Both used to update
         every frame, which is what made the deep camera feel locked: pan and
         the specimen glided along with you, orbit and it rotated to keep
         showing the same face. A fixed subject is what makes the free camera
         real — orbit shows its far side, pan moves you off it and back.

         Roaming is the escape hatch: drag the look-at point clearly outside
         the current subject's neighbourhood and the microscope re-anchors to
         wherever you have gone — following your intent, not your every pan. */
      if (m.active && this._anchor) {
        const model = this.micro.models.get(this._microActive);
        const roam = Math.max((model ? this._extentOf(model) : 0.006) || 0.006, 0.004) * 2.4;
        // destination, not transit: one clean re-anchor per journey
        const dest = this.controls.destinationTarget();
        if (dest.distanceTo(this._anchor.pos) > roam) {
          this._setAnchor(dest);
        }
      }
      const anchorPos = this._anchor ? this._anchor.pos : this.controls.target;
      this._microPos.lerp(anchorPos, clamp(dt * 6, 0, 1));
      this.micro.root.position.copy(this._microPos);
      this.micro.root.quaternion.slerp(this._q, clamp(dt * 4, 0, 1));
      const model = this.micro.models.get(this._microActive);
      if (model) {
        for (const mm of model.materials) {
          const u = mm.uniforms?.uOpacity;
          if (u) u.value = (mm.userData.baseOpacity ?? 1) * microBlend * (1 - 0.97 * cellBlend);
        }
        this._driveSpindleGeometry(model);
        /* The bed's fibril and speck crowds share the cell's drive: they pack
           down under the same local congestion and their gentle drift stops
           when the physiology is held. */
        const ms = this._localMechState();
        const bedJitter = this.store.physio.running ? 0.45 : 0.08;
        for (const c of model.crowds || []) {
          c.material.uniforms.uCongest.value = ms.congest * 0.55;
          c.material.uniforms.uJitter.value = bedJitter;
        }
      }
    } else if (this._microActive) {
      for (const [, m] of this.micro.models) m.group.visible = false;
      this._microActive = null;
    }

    /* ---- the cellular interior ---- */
    if (this.cell) {
      const wantCell = cellBlend > 0.01;
      this.cell.root.visible = wantCell;
      if (wantCell) {
        // anchored to the same travelling look-at point as the micro models,
        // so descending anywhere lands inside a cell of the local tissue
        this.cell.root.position.copy(this._microPos);
        const ms = this._localMechState();
        this.cell.update(dt, {
          blend: cellBlend,
          strain: ms.strain,
          velocity: ms.velocity,
          running: this.store.physio.running,
          congest: ms.congest,
        });
      }
    }
  }

  /**
   * Un-scaled world extent of a micro model, metres. Measured once and cached.
   *
   * The group carries the live axial stretch, so the scale is divided back out —
   * framing must not breathe with the subject, or the camera would chase a
   * millimetre of strain in and out on every breath.
   */
  _extentOf(model) {
    const hit = this._microExtent.get(model.id);
    if (hit !== undefined) return hit;
    const wasVisible = model.group.visible;
    model.group.visible = true;
    model.group.updateMatrixWorld(true);
    // frame the ending itself, not its tissue bed — the bed is scenery that
    // should extend past the frame, and framing the union is a wide shot of it
    this._box.setFromObject(model.subject || model.group);
    model.group.visible = wasVisible;
    this._box.getSize(this._vec);
    const s = model.group.scale;
    const extent = Math.max(this._vec.x / (s.x || 1), this._vec.y / (s.y || 1), this._vec.z / (s.z || 1));
    // an empty or not-yet-built group would otherwise cache a zero forever
    const value = extent > 1e-6 ? extent : null;
    if (value !== null) this._microExtent.set(model.id, value);
    return value;
  }

  /**
   * Pull back far enough to see the whole ROI when the mode engages.
   *
   * Microscope mode covers everything past the Tissue tier, and a six-millimetre
   * spindle does not fit in the nine-hundred-micron Receptor view — arriving
   * there by a tier jump put the camera inside the annulospiral coil, which is a
   * fine place to look around and a useless place to *arrive*: the mode claims to
   * focus one ROI and instead showed a yellow ribbon filling the frame.
   *
   * Only widens, and only on the transition into the mode. Zooming further in
   * afterwards is the user's business and is left alone; this is the framing the
   * mode opens with, not a leash.
   */
  /**
   * The solved local mechanical state at the anchored element — strain,
   * velocity, and a congestion composite of the intervention fields
   * (stiffening, viscosity, pressure) at its two nodes. Restriction raises
   * the first two, compression the third, and the whole-body tools write all
   * of them through the one verified intervention path: this is the first
   * physics read at one more scale, never a second one. The composite is
   * shaped fast-rise (c·(2−c)) so a moderate UI-applied intervention already
   * reads unmistakably, not only the direct-hit maximum.
   */
  _localMechState() {
    const sp = this.spindle;
    if (!sp?.resolved) return { congest: 0, strain: 0, velocity: 0 };
    const sv = sp.solver;
    const a = sv.ea[sp.element];
    const b = sv.eb[sp.element];
    const stiff = (sv.stiffness[a] + sv.stiffness[b]) * 0.5;
    const visc = (sv.viscosity[a] + sv.viscosity[b]) * 0.5;
    const press = (sv.pressure[a] + sv.pressure[b]) * 0.5;
    const raw = clamp(stiff * 1.2 + visc * 0.8 + press * 0.7, 0, 1);
    return { congest: raw * (2 - raw), strain: sp.strain, velocity: sp.velocity };
  }

  /**
   * Resolve and set the microscope's anchor at a point.
   *
   * The structure is the user's explicit selection when there is exactly one,
   * otherwise the nearest anchorable structure to the point — so a dive into
   * the forearm lands on forearm tissue, not on a preset site chosen at build
   * time. The onAnchor hook rebinds the micro-mechanics to that structure's
   * own network element, which is what keeps strain, congestion and the whole
   * cellular response local to wherever the user is actually looking.
   */
  _setAnchor(point, structure = null) {
    const s = structure || this._anchorCandidate(point);
    this._anchor = { pos: point.clone(), key: s?.key || null };
    this.onAnchor?.(s, point);
    // face the camera once, at anchor time
    const dir = this._vec.subVectors(this.camera.position, point);
    dir.y = 0;
    if (dir.lengthSq() > 1e-12) {
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z));
    }
  }

  /** Nearest anchorable structure to a point; explicit selection wins. */
  _anchorCandidate(point) {
    if (this.store.selection.size === 1) {
      const s = this.registry.get([...this.store.selection][0]);
      if (s && s.nodes.length) return s;
    }
    let best = null;
    let bestD = Infinity;
    for (const s of this.registry.list) {
      if (!ANCHOR_LAYERS.has(s.layer) || !s.nodes.length) continue;
      // span-discounted, so a large structure whose envelope contains the
      // point beats a small one whose centre happens to be marginally closer
      const d = point.distanceTo(s.center) - s.span * 0.25;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * Anchor the microscope to a specific structure — the selection path.
   * Flies the look-at point there; the anchor is set immediately so the
   * subject and the mechanics arrive before the camera does.
   */
  reanchorTo(s) {
    if (!s || !s.nodes.length || !this.store.micro.active) return false;
    this.controls.flyTo({ target: s.center.clone(), duration: 1.1 });
    this._setAnchor(s.center, s);
    return true;
  }

  /**
   * @param {boolean} fit  false (entry): only widen, never steal a zoom the
   *                       user already made. true (subject switch): fly to the
   *                       new subject's own span in either direction, because
   *                       the previous framing belonged to a different-sized
   *                       ending and keeping it leaves a speck or a wall.
   */
  _frameMicroSubject(fit = false) {
    const model = this.micro.models.get(this.store.microFocus);
    if (!model) return;
    const extent = this._extentOf(model);
    if (!extent) return;
    const want = extent * MICRO_FRAME_MARGIN;
    /* Judge by where the camera is *headed*, not where it happens to be
       mid-flight — and never hijack a descent to the cellular tier: a jump
       from the body to the Cell crosses the microscope threshold on the way
       down, and widening to frame the spindle would cancel the user's jump. */
    const dest = this.controls.destinationSpan();
    if (dest <= SCALES[5].span * 2.2) return;
    if (!fit && dest >= want * 0.98) return;
    if (fit && Math.abs(dest / want - 1) < 0.12) return;
    this.controls.flyTo({ span: want, duration: 0.9 });
  }

  /**
   * Stretch the drawn spindle by the simulated length of the muscle it lies in.
   *
   * A spindle sits in parallel with the extrafusal fibres, so its length follows
   * the muscle's — that is the entire mechanical premise of the receptor, and it
   * is why this is a scale factor taken straight from the solver rather than an
   * authored animation. The transverse axes shrink as the reciprocal square root
   * of the axial stretch, which conserves volume to first order; a capsule that
   * lengthened without thinning would be showing something that does not happen.
   *
   * Strain here is small — around a percent — so it is amplified for display by
   * a factor the read-out states, exactly as the whole-body view exaggerates
   * millimetre motion. The *number* in the panel is always the true strain.
   */
  _driveSpindleGeometry(model) {
    const sp = this.spindle;
    if (!sp || !sp.resolved || model.id !== 'spindle') {
      model.group.scale.set(1, 1, 1);
      return;
    }
    const gain = this.store.micro.active ? MICRO_STRAIN_GAIN : 1;
    const axial = clamp(1 + sp.strain * gain, 0.55, 1.9);
    const transverse = 1 / Math.sqrt(axial);
    model.group.scale.set(transverse, axial, transverse);
  }

  /** Scale-bar readout: a round physical length and its width in pixels. */
  bar(viewportHeight) {
    const span = this.controls.span;
    const target = span * 0.16;
    const len = niceRound(target);
    const px = (len / span) * viewportHeight;
    // the "endings at true size" note belongs to the receptor scene; inside
    // the cell the endings are not drawn at all
    return { len, px, text: formatLength(len), toScale: receptorsToScale(this.tier) && this.cellBlend < 0.5 };
  }

  get tierLabel() {
    const i = clamp(Math.round(this.tier), 0, SCALES.length - 1);
    return SCALES[i].name;
  }
}
