/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Living physiology.

   Four coupled rhythms drive the network's rest targets every
   frame: cardiac, respiratory, visceral motility and fluid
   transport. Nothing here is decorative — each one writes into the
   tensegrity solver, which means each one is also modulated by it.
   Stiffen a region and the excursion there genuinely falls, because
   the drive has to work against the same constraints the solver is
   enforcing.

   Waveforms are shaped rather than sinusoidal: the cardiac cycle
   has a systolic upstroke, an incisura and a diastolic decay, and
   breathing carries the ~1:1.6 inspiratory-to-expiratory ratio of
   quiet respiration.
   ============================================================ */

import * as THREE from 'three';
import { clamp, TAU, fbm1, LowPass } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Aortic-style pressure waveform over one normalised cardiac cycle. */
export function cardiacWave(p) {
  // p in [0,1): 0 = onset of systole
  const upstroke = Math.exp(-Math.pow((p - 0.10) / 0.062, 2));
  const shoulder = 0.42 * Math.exp(-Math.pow((p - 0.2) / 0.1, 2));
  const incisura = -0.16 * Math.exp(-Math.pow((p - 0.315) / 0.028, 2));
  const dicrotic = 0.3 * Math.exp(-Math.pow((p - 0.37) / 0.055, 2));
  const diastole = 0.3 * Math.exp(-(p - 0.4) * 2.6) * (p > 0.4 ? 1 : 0);
  return clamp(upstroke + shoulder + incisura + dicrotic + diastole * 0.6, 0, 1.4);
}

/** Ventricular contraction envelope (mechanical, leads the pressure wave). */
export function contractionWave(p) {
  const sys = Math.exp(-Math.pow((p - 0.14) / 0.1, 2));
  const fill = 0.22 * Math.exp(-Math.pow((p - 0.62) / 0.14, 2));
  return clamp(sys + fill * 0.5, 0, 1.2);
}

/** Respiratory flow-shaped displacement: 0 at end-expiration, 1 at end-inspiration. */
export function breathWave(p) {
  // inspiration occupies the first 38 % of the cycle, expiration is longer and
  // passive-looking, with a short end-expiratory pause
  const TI = 0.38;
  if (p < TI) {
    const t = p / TI;
    return 0.5 - 0.5 * Math.cos(Math.PI * t); // smooth active rise
  }
  const t = (p - TI) / (1 - TI);
  // passive elastic recoil: exponential decay, then a pause near zero
  return Math.exp(-t * 3.4) * (1 - Math.pow(t, 6));
}

export class Physiology {
  constructor(solver, net, store) {
    this.solver = solver;
    this.net = net;
    this.store = store;

    this.cardiacPhase = 0;
    this.respPhase = 0.6;
    this.motilityPhase = 0;
    this.time = 0;

    this.pulse = 0;
    this.contraction = 0;
    this.breath = 0;
    this.breathRate = 0; // d(breath)/dt — drives the phasic receptors
    this._breathPrev = 0;

    /* readouts */
    this.out = {
      pulse: 0,
      breath: 0,
      hr: 62,
      rr: 13,
      tidalDemand: 0, // commanded diaphragm excursion (m)
      tidalActual: 0, // achieved excursion (m)
      excursionRatio: 1,
      iap: 0, // intra-abdominal pressure proxy 0..1
      venousReturn: 1,
      lymphFlow: 1,
      perfusion: 1,
      pulsePressure: 1,
      visceralMotion: 0,
    };

    /* peak diaphragm excursion, commanded vs. achieved, over one whole breath */
    this._peakDemand = 0;
    this._peakActual = 0;
    this.cycleDemand = 0;
    this.cycleActual = 0;
    this._ratio = 1;
    this._ratioLP = new LowPass(0.35, 1);

    this._iap = new LowPass(0.6, 0.2);
    this._vr = new LowPass(1.2, 1);
    this._lf = new LowPass(3.0, 1);

    /* group nodes by driver tag once */
    this.groups = { ribs: [], diaphragm: [], dome: [], abdomen: [], cardiac: [], lung: [], visceral: [], spine: [] };
    net.nodes.forEach((n, i) => {
      switch (n.driver) {
        case 'ribs':
          this.groups.ribs.push(i);
          break;
        case 'diaphragm':
          this.groups.diaphragm.push(i);
          break;
        case 'diaphragmDome':
          this.groups.dome.push(i);
          break;
        case 'abdomen':
          this.groups.abdomen.push(i);
          break;
        case 'cardiac':
          this.groups.cardiac.push(i);
          break;
        case 'lung':
          this.groups.lung.push(i);
          break;
        case 'visceral':
          this.groups.visceral.push(i);
          break;
        case 'spine':
          this.groups.spine.push(i);
          break;
        default:
          break;
      }
    });

    /* rib kinematics: precompute each rib's excursion axes from its geometry */
    this.ribPlan = this.groups.ribs.map((i) => {
      const n = net.nodes[i];
      const m = /rib:(\d+):(lat|ant)/.exec(n.name);
      const home = V(solver.home[i * 3], solver.home[i * 3 + 1], solver.home[i * 3 + 2]);
      if (!m) {
        // sternum: pump-handle lift, forward and up
        return { i, dir: V(0, 0.5, 1).normalize(), amp: 0.0042, phase: 0 };
      }
      const num = parseInt(m[1], 10);
      const kind = m[2];
      const t = (num - 1) / 11;
      // upper ribs: pump handle (mostly anterior/superior)
      // lower ribs: bucket handle (mostly lateral/superior)
      const pump = 1 - t;
      const bucket = t;
      const lateral = Math.sign(home.x) || 1;
      const dir =
        kind === 'ant'
          ? V(lateral * 0.18 * bucket, 0.5 + 0.3 * pump, 0.75 * pump + 0.25).normalize()
          : V(lateral * (0.55 + 0.4 * bucket), 0.45 + 0.2 * pump, 0.2 * pump).normalize();
      const amp = (kind === 'ant' ? 0.0052 : 0.0044) * (0.6 + 0.8 * Math.sin((0.15 + t * 0.8) * Math.PI));
      return { i, dir, amp, phase: 0 };
    });

    /* per-organ motility signature: period in seconds and excursion */
    this.organPlan = {};
    net.nodes.forEach((n, i) => {
      if (!n.name.startsWith('organ:')) return;
      const id = n.name.slice(6);
      const cfg = {
        liver: { period: 0, breath: 0.019, dir: V(0, -1, 0.12), motility: 0.0006 },
        stomach: { period: 20, breath: 0.011, dir: V(0, -1, 0.1), motility: 0.0022 },
        spleen: { period: 0, breath: 0.01, dir: V(0.1, -1, 0), motility: 0.0006 },
        kidneyL: { period: 0, breath: 0.013, dir: V(0, -1, 0), motility: 0.0005 },
        kidneyR: { period: 0, breath: 0.014, dir: V(0, -1, 0), motility: 0.0005 },
        smallInt: { period: 6.2, breath: 0.007, dir: V(0, -1, 0.3), motility: 0.0035 },
        colon: { period: 34, breath: 0.005, dir: V(0, -1, 0.2), motility: 0.0026 },
        bladder: { period: 0, breath: 0.002, dir: V(0, 0, 0.2), motility: 0.0004 },
        heart: { period: 0, breath: 0.008, dir: V(0, -1, 0.2), motility: 0 },
        lungL: { period: 0, breath: 0.014, dir: V(0.12, -0.4, 0.1), motility: 0 },
        lungR: { period: 0, breath: 0.014, dir: V(-0.12, -0.4, 0.1), motility: 0 },
      }[id];
      if (cfg) {
        cfg.dir.normalize();
        this.organPlan[i] = { ...cfg, id, seed: i * 13 };
      }
    });
  }

  /** How much a commanded excursion actually survives the local mechanical state. */
  _gate(i) {
    const s = this.solver;
    return clamp(1 - 0.78 * s.stiffness[i] - 0.42 * s.pressure[i], 0.06, 1);
  }

  step(dt, speed = 1) {
    const p = this.store.physio;
    const sdt = dt * speed;
    this.time += sdt;

    /* ---------------- phases ---------------- */
    const hr = p.heartRate;
    const rr = p.respRate;
    this.cardiacPhase = (this.cardiacPhase + (sdt * hr) / 60) % 1;
    const prevResp = this.respPhase;
    this.respPhase = (this.respPhase + (sdt * rr) / 60) % 1;
    // a new breath has started — publish the last cycle's peak excursion and
    // begin accumulating the next. Reporting the instantaneous value instead
    // would make the meter read whatever point of the cycle you glanced at.
    if (this.respPhase < prevResp) {
      this.cycleDemand = this._peakDemand;
      this.cycleActual = this._peakActual;
      this._peakDemand = 0;
      this._peakActual = 0;
    }
    this.motilityPhase += sdt;

    // physiological beat-to-beat variation, coupled to breathing
    // (respiratory sinus arrhythmia: rate rises on inspiration)
    const rsa = 0.035 * Math.cos(this.respPhase * TAU);
    const jitter = 0.008 * fbm1(this.time * 0.7, 2, 3);
    const cPhase = (this.cardiacPhase + rsa + jitter + 1) % 1;

    this.pulse = cardiacWave(cPhase);
    this.contraction = contractionWave(cPhase);
    const breathRaw = breathWave(this.respPhase);
    this._breathPrev = this.breath;
    this.breath = breathRaw;
    this.breathRate = (this.breath - this._breathPrev) / Math.max(dt, 1e-4);

    const depth = p.breathDepth;
    const s = this.solver;

    /* ---------------- respiratory drive ---------------- */
    let tidalDemand = 0;
    let tidalActual = 0;

    // diaphragm: dome descends and flattens on inspiration
    for (const i of this.groups.dome) {
      const cmd = 0.019 * depth * this.breath;
      const g = this._gate(i);
      s.restOffset(i, 0, -cmd * g, 0.0018 * this.breath * g);
      tidalDemand += cmd;
      tidalActual += cmd * g;
    }
    for (const i of this.groups.diaphragm) {
      const hx = s.home[i * 3];
      const hz = s.home[i * 3 + 2];
      const g = this._gate(i);
      // the rim descends less than the dome and moves outward as the cage opens
      const drop = 0.0072 * depth * this.breath * g;
      const out = 0.0026 * depth * this.breath * g;
      const r = Math.hypot(hx, hz) || 1;
      s.restOffset(i, (hx / r) * out, -drop, (hz / r) * out);
    }

    // rib cage: pump-handle above, bucket-handle below
    for (const plan of this.ribPlan) {
      const g = this._gate(plan.i);
      const a = plan.amp * depth * this.breath * g;
      s.restOffset(plan.i, plan.dir.x * a, plan.dir.y * a, plan.dir.z * a);
    }

    // abdominal wall: displaced forward as the diaphragm descends
    for (const i of this.groups.abdomen) {
      const g = this._gate(i);
      const hx = s.home[i * 3];
      const forward = 0.0062 * depth * this.breath * g;
      s.restOffset(i, hx * 0.06 * depth * this.breath * g, -0.0008 * this.breath * g, forward);
    }

    // the thoracic spine extends very slightly on inspiration
    for (const i of this.groups.spine) {
      const y = s.home[i * 3 + 1];
      if (y < 1.1 || y > 1.45) {
        s.restOffset(i, 0, 0, 0);
        continue;
      }
      const w = Math.sin(((y - 1.1) / 0.35) * Math.PI);
      s.restOffset(i, 0, 0, -0.0011 * depth * this.breath * w * this._gate(i));
    }

    /* ---------------- cardiac drive ---------------- */
    for (const i of this.groups.cardiac) {
      const g = this._gate(i);
      const c = this.contraction;
      // the heart shortens along its long axis and swings slightly with the breath
      s.restOffset(
        i,
        0.0016 * c * g,
        (0.0026 * c - 0.008 * depth * this.breath) * g,
        (-0.0012 * c + 0.0016 * depth * this.breath) * g
      );
    }
    for (const i of this.groups.lung) {
      const plan = this.organPlan[i];
      const g = this._gate(i);
      const b = (plan?.breath ?? 0.012) * depth * this.breath * g;
      const d = plan?.dir ?? V(0, -1, 0);
      s.restOffset(i, d.x * b, d.y * b, d.z * b);
    }

    /* ---------------- visceral motility ---------------- */
    let visceralMotion = 0;
    for (const key in this.organPlan) {
      const i = +key;
      if (this.groups.cardiac.includes(i) || this.groups.lung.includes(i)) continue;
      const plan = this.organPlan[i];
      const g = this._gate(i);
      const b = plan.breath * depth * this.breath * g;
      let m = 0;
      if (plan.period > 0) {
        const ph = (this.motilityPhase / plan.period) * TAU + plan.seed;
        // peristalsis is a travelling contraction, not a standing oscillation
        m = plan.motility * p.motility * (Math.sin(ph) * 0.7 + 0.3 * Math.sin(ph * 2.3 + 1.1)) * g;
      }
      const wobble = plan.motility * 0.35 * p.motility * fbm1(this.motilityPhase * 0.5 + plan.seed, 2, plan.seed) * g;
      s.restOffset(i, plan.dir.x * b + wobble, plan.dir.y * b + m, plan.dir.z * b + m * 0.4);
      visceralMotion += Math.abs(m) + Math.abs(b);
    }

    /* ---------------- fluid consequences ---------------- */

    // intra-abdominal pressure rises with diaphragmatic descent, abdominal tone
    // and any applied compression
    let extPressure = 0;
    for (let i = 0; i < s.count; i++) extPressure = Math.max(extPressure, s.pressure[i]);
    const iapTarget = clamp(0.16 + 0.42 * this.breath * depth + 0.3 * (p.tone - 0.4) + 0.5 * extPressure, 0, 1);
    const iap = this._iap.step(iapTarget, dt);

    // thoracic pump: inspiration drops intrathoracic pressure and augments return.
    // Compression of the compliant venous side reduces it.
    let venousImpedance = 0;
    let n = 0;
    for (let i = 0; i < s.count; i++) {
      venousImpedance += s.pressure[i] * 0.7 + s.stiffness[i] * 0.35;
      n++;
    }
    venousImpedance /= Math.max(1, n);
    const vrTarget = clamp((0.82 + 0.34 * this.breath * depth) * (1 - 1.8 * venousImpedance), 0.15, 1.35);
    const venousReturn = this._vr.step(vrTarget, dt);

    // lymph has no pump: flow tracks tissue motion, breathing and pulse
    const motionDrive = clamp(
      0.28 + 0.5 * Math.abs(this.breathRate) * 0.25 + 0.25 * visceralMotion * 60 + 0.18 * this.pulse,
      0,
      1.6
    );
    const lymphTarget = clamp(motionDrive * (1 - 1.5 * venousImpedance), 0.05, 1.4);
    const lymphFlow = this._lf.step(lymphTarget, dt);

    // perfusion follows return with a lag, and falls where tissue is compressed
    const perfusion = clamp(venousReturn * (1 - 0.85 * extPressure), 0.1, 1.3);

    /* ---------------- tone ---------------- */
    s.setTone(clamp(p.tone + 0.06 * this.breath * depth, 0, 1));

    /* ---------------- publish ---------------- */
    const o = this.out;
    o.pulse = this.pulse;
    o.breath = this.breath;
    o.hr = hr * (1 + rsa * 0.6);
    o.rr = rr;
    if (tidalDemand > this._peakDemand) this._peakDemand = tidalDemand;
    if (tidalActual > this._peakActual) this._peakActual = tidalActual;
    // Peak millimetres come from the completed cycle; the ratio is tracked
    // continuously (and held through the end-expiratory pause, when there is no
    // commanded excursion to divide by) so the meter responds to an intervention
    // in under a second instead of waiting out a whole breath.
    if (tidalDemand > 1e-4) this._ratio = this._ratioLP.step(tidalActual / tidalDemand, dt);
    o.tidalDemand = this.cycleDemand || this._peakDemand;
    o.tidalActual = this.cycleActual || this._peakActual;
    o.excursionRatio = this._ratio;
    o.iap = iap;
    o.venousReturn = venousReturn;
    o.lymphFlow = lymphFlow;
    o.perfusion = perfusion;
    o.pulsePressure = clamp(1 - 0.5 * extPressure, 0.2, 1.2);
    o.visceralMotion = visceralMotion * 100;
  }
}
