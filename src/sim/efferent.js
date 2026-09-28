/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Efferent signalling — the outward half of the loop.

   Three schematic channels, none of them a second physics engine:

     SOMATIC MOTOR    a global alpha-like drive expressed through the
                      solver's existing tone path. The slider the user
                      already has (resting myofascial tone) *is* the
                      command; this module adds a transient voluntary
                      burst on top and reports the combined drive so
                      the outward packet streams have a real quantity
                      to encode. Nothing here touches the solver except
                      through store.physio.tone → physiology → setTone,
                      the path that already existed.

     FUSIMOTOR        the gamma channel. The static / dynamic gamma
                      drives already live in store.micro and are already
                      consumed by the spindle models, which changes the
                      spindle's afferent output — that closed loop is
                      the point. This module only *reads* those values
                      to drive the outward visualisation and the meter.

     AUTONOMIC        a deliberately schematic two-tone balance
                      (sympathetic-like vs parasympathetic-like). It
                      produces small multipliers that physiology.js
                      applies to heart rate, visceral motility, breath
                      depth and venous impedance. The mapping is a
                      MODELLING ASSUMPTION for teaching — magnitudes are
                      chosen to be visible, not measured; no claim about
                      autonomic physiology beyond the sign conventions
                      every textbook carries (sympathetic: rate up,
                      motility down, vessels constrict; parasympathetic
                      the reverse).

   An optional reflex term nudges the balance sympathetic-ward when
   venous return falls. It is labelled schematic in the UI: a shape
   borrowed from the baroreflex, not a model of it.
   ============================================================ */

import { clamp, lerp, approach, LowPass } from '../core/util.js';

/** How hard the voluntary burst pushes tone, and how fast it decays. */
const BURST_GAIN = 0.32;
const BURST_DECAY = 0.9; // 1/s

/** Autonomic effect sizes — schematic, visible, and deliberately modest. */
const AUTONOMIC = {
  hrSpan: [0.86, 1.22], // × heart rate, para-dominant → symp-dominant
  motilitySpan: [1.25, 0.55], // × visceral motility
  breathSpan: [1.06, 0.94], // × breath depth (para slows and deepens)
  vasoSpan: [-0.04, 0.1], // added venous impedance (vascular tone)
};

export class Efferent {
  constructor(store, physio, solver) {
    this.store = store;
    this.physio = physio;
    this.solver = solver;

    /** transient voluntary somatic burst, decays on its own */
    this.burst = 0;

    /** smoothed channel outputs, consumed by streams + HUD */
    this.out = {
      somatic: 0, // 0..1 combined alpha-like drive
      fusimotor: 0, // 0..1 combined gamma drive
      sympathetic: 0.5, // 0..1 weight of the sympathetic-like tone
      parasympathetic: 0.5,
      autonomicRate: 0.5, // packet-rate proxy for the streams
      drive: 0, // headline EFFERENT DRIVE composite 0..1
      /* multipliers physiology applies — identity when balanced */
      hrMul: 1,
      motilityMul: 1,
      breathMul: 1,
      vasoImpedance: 0,
      reflex: 0, // how much of the balance is the schematic reflex
    };

    this._sympLP = new LowPass(1.4, 0.5);
    this._driveLP = new LowPass(0.5, 0);
  }

  /** Voluntary motor burst — a keypress-sized "contract now". */
  pulse(strength = 1) {
    this.burst = clamp(this.burst + BURST_GAIN * strength, 0, 0.6);
  }

  step(dt) {
    const st = this.store;
    const o = this.out;

    /* ---- somatic ---- */
    this.burst = Math.max(0, this.burst - BURST_DECAY * this.burst * dt - 0.02 * dt);
    // the burst rides the existing tone path: physiology reads effective tone
    o.somatic = clamp(st.physio.tone + this.burst, 0, 1);

    /* ---- fusimotor ---- */
    o.fusimotor = clamp(st.micro.gammaStatic * 0.6 + st.micro.gammaDynamic * 0.55, 0, 1);

    /* ---- autonomic two-tone ---- */
    const balance = clamp(st.efferent.autonomicBalance, 0, 1);
    let reflex = 0;
    if (st.efferent.reflex) {
      // schematic: falling venous return recruits sympathetic-like tone
      const vr = this.physio.out.venousReturn;
      reflex = clamp((0.62 - vr) * 1.1, 0, 0.3);
    }
    const symp = this._sympLP.step(clamp(balance + reflex, 0, 1), dt);
    o.sympathetic = symp;
    o.parasympathetic = 1 - symp;
    o.reflex = reflex;
    o.autonomicRate = clamp(0.25 + Math.abs(symp - 0.5) * 1.5, 0, 1);

    o.hrMul = lerp(AUTONOMIC.hrSpan[0], AUTONOMIC.hrSpan[1], symp);
    o.motilityMul = lerp(AUTONOMIC.motilitySpan[0], AUTONOMIC.motilitySpan[1], symp);
    o.breathMul = lerp(AUTONOMIC.breathSpan[0], AUTONOMIC.breathSpan[1], symp);
    o.vasoImpedance = lerp(AUTONOMIC.vasoSpan[0], AUTONOMIC.vasoSpan[1], symp);

    /* ---- headline composite ---- */
    // Layer C composite: outward traffic across the three channels, weighted so
    // a quiet body reads low rather than idling at 50 %.
    const target = clamp(0.45 * o.somatic + 0.3 * o.fusimotor + 0.35 * Math.abs(symp - 0.5) * 2 + 0.4 * this.burst, 0, 1);
    o.drive = this._driveLP.step(target, dt);
  }

  /** Snapshot for diagnostics and tests. */
  state() {
    return {
      ...this.out,
      burst: this.burst,
      note:
        'Schematic teaching channels. Somatic drive rides the existing tone path; gamma drives the spindle models; ' +
        'the autonomic balance applies small multipliers inside physiology. Model output — not a measurement.',
    };
  }
}
