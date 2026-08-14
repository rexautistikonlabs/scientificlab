/* ============================================================
   Orbit controller purpose-built for multi-scale work.

   • zoom is logarithmic, so one wheel gesture reads the same at
     1 m and at 100 µm — this is what makes "going in and out of
     scope" feel continuous rather than stepped.
   • pan and dolly speeds are proportional to the current view
     span, again for scale invariance.
   • flyTo() drives an eased cinematic transition that the scale
     manager can hand off to.
   ============================================================ */

import * as THREE from 'three';
import { clamp, approach, easeInOutQuint } from './util.js';

const EPS = 1e-6;

export class Controls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.target = new THREE.Vector3(0, 0.95, 0);
    this._target = this.target.clone();

    this.theta = 0.42; // azimuth (rad)
    this.phi = Math.PI * 0.5 - 0.06; // polar from +Y
    this.dist = 3.0;

    this._theta = this.theta;
    this._phi = this.phi;
    this._dist = this.dist;

    this.minDist = 0.00035;
    this.maxDist = 6.0;
    this.minPhi = 0.12;
    this.maxPhi = Math.PI - 0.12;

    this.damping = 9.0;
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.enabled = true;
    this.autoRotate = 0; // rad / s
    /** near plane as a fraction of the orbit distance — see update() */
    this.nearFrac = 0.004;

    this._fly = null;
    this._pointers = new Map();
    this._mode = null; // 'orbit' | 'pan'
    this._last = new THREE.Vector2();
    this._pinch = 0;
    this._moved = 0;

    this._bind();
    this.update(0);
  }

  /* ---------------- input ---------------- */

  _bind() {
    const d = this.dom;
    d.style.touchAction = 'none';
    this._onDown = (e) => {
      if (!this.enabled) return;
      d.setPointerCapture?.(e.pointerId);
      this._pointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
      this._moved = 0;
      if (this._pointers.size === 1) {
        this._mode = e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey) ? 'pan' : 'orbit';
        this._last.set(e.clientX, e.clientY);
        d.classList.add('grabbing');
      } else if (this._pointers.size === 2) {
        this._mode = 'pinch';
        this._pinch = this._pinchDist();
        this._pinchMid(this._last);
      }
      this._fly = null;
    };

    this._onMove = (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      p.set(e.clientX, e.clientY);

      if (this._mode === 'orbit' && this._pointers.size === 1) {
        const dx = e.clientX - this._last.x;
        const dy = e.clientY - this._last.y;
        this._moved += Math.abs(dx) + Math.abs(dy);
        const h = this.dom.clientHeight || 1;
        this.theta -= (dx / h) * Math.PI * 1.1 * this.rotateSpeed;
        this.phi = clamp(this.phi - (dy / h) * Math.PI * 1.1 * this.rotateSpeed, this.minPhi, this.maxPhi);
        this._last.set(e.clientX, e.clientY);
      } else if (this._mode === 'pan' && this._pointers.size === 1) {
        this._pan(e.clientX - this._last.x, e.clientY - this._last.y);
        this._last.set(e.clientX, e.clientY);
      } else if (this._mode === 'pinch' && this._pointers.size >= 2) {
        const nd = this._pinchDist();
        if (this._pinch > EPS && nd > EPS) this.zoomBy(Math.log(this._pinch / nd) * 1.1);
        this._pinch = nd;
        const mid = new THREE.Vector2();
        this._pinchMid(mid);
        this._pan(mid.x - this._last.x, mid.y - this._last.y);
        this._last.copy(mid);
      }
    };

    this._onUp = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) {
        this._mode = null;
        this.dom.classList.remove('grabbing');
      } else if (this._pointers.size === 1) {
        this._mode = 'orbit';
        const only = [...this._pointers.values()][0];
        this._last.copy(only);
      }
    };

    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 400 : 1;
      this.zoomBy(clamp((e.deltaY * unit) / 640, -0.6, 0.6) * this.zoomSpeed);
      this._fly = null;
    };

    d.addEventListener('pointerdown', this._onDown);
    d.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    d.addEventListener('wheel', this._onWheel, { passive: false });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pinchDist() {
    const [a, b] = [...this._pointers.values()];
    return a && b ? a.distanceTo(b) : 0;
  }
  _pinchMid(out) {
    const [a, b] = [...this._pointers.values()];
    if (a && b) out.set((a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  /** did the last gesture move far enough to count as a drag (vs. a click)? */
  get dragged() {
    return this._moved > 6;
  }

  /** true while a pointer gesture is in progress */
  get dragging() {
    return !!this._mode;
  }

  _pan(dx, dy) {
    const h = this.dom.clientHeight || 1;
    const span = this.span;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const k = span / h;
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(up, dy * k);
  }

  /** Logarithmic dolly — `amount` is in e-folds. */
  zoomBy(amount) {
    this.dist = clamp(this.dist * Math.exp(amount), this.minDist, this.maxDist);
  }

  /** Vertical world-space extent visible at the target plane. */
  get span() {
    const f = (this.camera.fov * Math.PI) / 180;
    return 2 * this._dist * Math.tan(f / 2);
  }

  setSpan(span, immediate = false) {
    const f = (this.camera.fov * Math.PI) / 180;
    const d = clamp(span / (2 * Math.tan(f / 2)), this.minDist, this.maxDist);
    this.dist = d;
    if (immediate) this._dist = d;
  }

  /** Convert a view span in metres to the orbit distance that produces it. */
  distForSpan(span) {
    const f = (this.camera.fov * Math.PI) / 180;
    return span / (2 * Math.tan(f / 2));
  }

  /**
   * Hard floor on how far in the camera may travel. Used by the entitlement gate
   * to stop free-tier zoom at the region scale: the wheel physically cannot go
   * deeper, rather than the deeper view being drawn and then hidden.
   */
  setMinSpan(span) {
    this.minDist = Math.max(0.00035, this.distForSpan(span));
    if (this.dist < this.minDist) this.dist = this.minDist;
    if (this._dist < this.minDist) this._dist = this.minDist;
  }

  /* ---------------- transitions ---------------- */

  /**
   * Cinematic move. Any of target / span / theta / phi may be omitted.
   * Returns a promise resolved when the move lands.
   */
  flyTo({ target, span, dist, theta, phi, duration = 1.35 } = {}) {
    const from = {
      target: this._target.clone(),
      dist: this._dist,
      theta: this._theta,
      phi: this._phi,
    };
    let toDist = dist ?? this._dist;
    if (span != null) {
      const f = (this.camera.fov * Math.PI) / 180;
      toDist = span / (2 * Math.tan(f / 2));
    }
    // choose the short way round the azimuth
    let toTheta = theta ?? this._theta;
    while (toTheta - from.theta > Math.PI) toTheta -= Math.PI * 2;
    while (toTheta - from.theta < -Math.PI) toTheta += Math.PI * 2;

    const to = {
      target: target ? target.clone() : from.target.clone(),
      dist: clamp(toDist, this.minDist, this.maxDist),
      theta: toTheta,
      phi: clamp(phi ?? from.phi, this.minPhi, this.maxPhi),
    };

    return new Promise((resolve) => {
      this._fly = { from, to, t: 0, duration: Math.max(0.001, duration), resolve };
    });
  }

  /** Jump straight to a view with no transition — used for restoring a saved view. */
  snapTo({ target, span, dist, theta, phi } = {}) {
    this.cancelFly();
    if (target) {
      this.target.copy(target);
      this._target.copy(target);
    }
    if (span != null) this.setSpan(span, true);
    else if (dist != null) {
      this.dist = clamp(dist, this.minDist, this.maxDist);
      this._dist = this.dist;
    }
    if (theta != null) this.theta = this._theta = theta;
    if (phi != null) this.phi = this._phi = clamp(phi, this.minPhi, this.maxPhi);
    this.update(0);
    return this;
  }

  get flying() {
    return !!this._fly;
  }

  cancelFly() {
    if (this._fly) {
      this._fly.resolve?.();
      this._fly = null;
    }
  }

  /* ---------------- frame ---------------- */

  update(dt) {
    if (this._fly) {
      const f = this._fly;
      f.t += dt;
      const u = clamp(f.t / f.duration);
      const e = easeInOutQuint(u);
      // distance interpolates in log space so the traversal reads as constant speed
      this._dist = Math.exp(mixLog(f.from.dist, f.to.dist, e));
      this._theta = f.from.theta + (f.to.theta - f.from.theta) * e;
      this._phi = f.from.phi + (f.to.phi - f.from.phi) * e;
      this._target.lerpVectors(f.from.target, f.to.target, e);
      this.dist = this._dist;
      this.theta = this._theta;
      this.phi = this._phi;
      this.target.copy(this._target);
      if (u >= 1) {
        const r = f.resolve;
        this._fly = null;
        r?.();
      }
    } else {
      if (this.autoRotate && !this._mode) this.theta += this.autoRotate * dt;
      const k = this.damping;
      this._theta = approach(this._theta, this.theta, k, dt);
      this._phi = approach(this._phi, this.phi, k, dt);
      this._dist = Math.exp(approach(Math.log(this._dist), Math.log(this.dist), k * 0.85, dt));
      this._target.x = approach(this._target.x, this.target.x, k, dt);
      this._target.y = approach(this._target.y, this.target.y, k, dt);
      this._target.z = approach(this._target.z, this.target.z, k, dt);
    }

    const sp = Math.sin(this._phi);
    this.camera.position.set(
      this._target.x + this._dist * sp * Math.sin(this._theta),
      this._target.y + this._dist * Math.cos(this._phi),
      this._target.z + this._dist * sp * Math.cos(this._theta)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._target);

    /* Depth range follows the working scale. `nearFrac` doubles as a cutaway
       control: pushing the near plane out toward the look-at point clips away
       whatever tissue lies between the camera and the structure being studied,
       which is how you get to look at an organ without first deleting the chest
       wall. The scale manager ramps it in as you descend. */
    this.camera.near = Math.max(1e-6, this._dist * this.nearFrac);
    this.camera.far = this._dist * 30 + 4;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._onDown);
    d.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    d.removeEventListener('wheel', this._onWheel);
  }
}

function mixLog(a, b, t) {
  return Math.log(Math.max(1e-9, a)) + (Math.log(Math.max(1e-9, b)) - Math.log(Math.max(1e-9, a))) * t;
}
