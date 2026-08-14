/* ============================================================
   Mechanotransduction and afferent signalling.

   The chain modelled here, in order:

     1. LOCAL MECHANICS   the solver's tension, strain rate and
                          interstitial pressure at each receptor site,
                          plus the pulsatile and respiratory stimulus
                          arriving from the physiology system.

     2. VISCOELASTIC FILTER  the tissue between the event and the
                          ending is a standard linear solid — a spring
                          in parallel with a Maxwell arm. Its relaxation
                          time constant rises with restriction, so the
                          filter attenuates high frequencies, adds phase
                          lag, and narrows dynamic range. This is the
                          step that makes a restriction change *what the
                          nervous system can know*, not merely how much
                          force is present.

     3. TRANSDUCTION      each class mixes tonic and phasic drive by its
                          own adaptation ratio, applies its threshold,
                          and saturates.

     4. RATE CODING        firing rate from a saturating (Naka-Rushton
                          style) function of the transduced amplitude.

     5. CONDUCTION        rate, dispersion and latency along the fibre
                          class, delivered to a pathway.

   Everything is qualitative but internally consistent: the same
   mechanical event produces different afferent traffic depending on
   the state of the tissue it has to travel through.
   ============================================================ */

import { clamp, lerp, LowPass, HighPass, Ring, TAU } from '../core/util.js';
import { RECEPTORS, RECEPTOR_ORDER, PATHWAYS } from '../anatomy/info.js';

/**
 * Standard linear solid, driven in series with the receptor.
 * `tau` is the relaxation time constant of the Maxwell arm; `ratio`
 * is the fraction of stiffness carried by that arm.
 */
class ViscoelasticFilter {
  constructor(tau = 0.05, ratio = 0.55) {
    this.tau = tau;
    this.ratio = ratio;
    this.q = 0; // internal state of the Maxwell arm
    this.out = 0;
  }

  /** Returns the strain the ending actually experiences. */
  step(x, dt, tau = this.tau) {
    const t = Math.max(1e-4, tau);
    // dq/dt = (x - q)/tau  → the arm relaxes toward the input
    this.q += (x - this.q) * (1 - Math.exp(-dt / t));
    // total transmitted = elastic path + relaxing path
    this.out = (1 - this.ratio) * x + this.ratio * this.q;
    return this.out;
  }
}

/**
 * Relaxation time constant of *healthy* tissue between a mechanical event and
 * the ending it reaches, in seconds. Chosen so the baseline transmission corner
 * (1 / 2πτ ≈ 200 Hz) sits just above the fastest thing any class needs to see —
 * i.e. an unrestricted body passes everything its receptors can resolve. This is
 * a property of the *path*, deliberately separate from each receptor's own
 * adaptation constant, which governs how the ending responds once the strain
 * arrives.
 */
const TISSUE_TAU = 8e-4;

/** How much restriction and compression lengthen that time constant. */
const VISCOSITY_GAIN = 26;
const STIFFNESS_GAIN = 3.5;

/**
 * Target filter interval, seconds. The number of substeps per rendered frame is
 * derived from this, so the receptor filters always see roughly 240 Hz whether
 * the display is running at 144 fps or the machine is struggling at 15. Without
 * that, a phasic ending's high-pass collapses on a slow frame and the class
 * reports itself as silent — a frame-rate artefact masquerading as physiology.
 */
const SUB_DT = 1 / 240;
const MAX_SUBSTEPS = 12;

/** One receptor population feeding one pathway. */
class Population {
  constructor(id, def) {
    this.id = id;
    this.def = def;
    this.filter = new ViscoelasticFilter(TISSUE_TAU, 0.6);
    this.tonic = new LowPass(Math.max(0.02, def.tau * 3));
    this.phasic = new HighPass(Math.max(0.004, def.tau));
    this.rateLP = new LowPass(0.09);
    this.ampLP = new LowPass(0.12);

    /* A parallel reference chain, identical except that its tissue path is
       always healthy. Comparing the two is what isolates *transmission* loss
       from the receptor's own adaptation — a rapidly adapting ending ignoring a
       static load is doing its job, not losing information. */
    this.refFilter = new ViscoelasticFilter(TISSUE_TAU, 0.6);
    this.refTonic = new LowPass(Math.max(0.02, def.tau * 3));
    this.refPhasic = new HighPass(Math.max(0.004, def.tau));
    this.refAmpLP = new LowPass(0.12);

    this.stimulus = 0; // true mechanical event at the site
    this.transmitted = 0; // what survived the tissue
    this.drive = 0; // post-transduction amplitude
    this.idealDrive = 0; // the same, through healthy tissue
    this.rate = 0; // firing rate, Hz
    this.rateNorm = 0; // 0..1 of the class's usable range
    this.fidelity = 1;
    this.latency = 0; // ms, total
    this.latency0 = 0; // ms, through healthy tissue
    this.bandwidth = 1;
    this.dispersion = 0;
    this.saturated = 0;
    this.trace = new Ring(240);
    this.idealTrace = new Ring(240);
    this.nodes = [];
  }
}

export class Afferent {
  constructor(solver, physio, store, populations) {
    this.solver = solver;
    this.physio = physio;
    this.store = store;

    this.pops = new Map();
    for (const id of RECEPTOR_ORDER) {
      const p = new Population(id, RECEPTORS[id]);
      p.nodes = populations?.find((q) => q.id === id)?.nodeSet || [];
      this.pops.set(id, p);
    }

    /** aggregate per-pathway state, consumed by the particle streams */
    this.pathways = new Map();
    for (const k in PATHWAYS) {
      this.pathways.set(k, { id: k, def: PATHWAYS[k], rate: 0, fidelity: 1, latency: 0, amp: 0 });
    }

    this.summary = {
      fidelity: 1,
      latency: 0,
      latencyBaseline: 0,
      latencyAdded: 0,
      timing: 1,
      bandwidth: 1,
      integrity: 1,
      firing: 0,
      totalRate: 0,
      degraded: [],
    };

    this._t = 0;
    this._focus = 'ruffini';
  }

  setFocus(id) {
    if (this.pops.has(id)) this._focus = id;
  }

  get focus() {
    return this.pops.get(this._focus);
  }

  /**
   * Relaxation time constant of the tissue path at a site, in seconds.
   * Restriction is primarily a loss of glide, so it lengthens tau sharply;
   * compression adds a smaller amount on top. A longer tau means the path
   * behaves as a slower low-pass: less amplitude, more phase lag, narrower
   * usable band.
   */
  _tauAt(viscosity, stiffness) {
    return TISSUE_TAU * (1 + VISCOSITY_GAIN * viscosity) * (1 + STIFFNESS_GAIN * stiffness);
  }

  step(dt) {
    const s = this.solver;
    const ph = this.physio;
    const tBase = this._t;
    this._t += dt;
    const substeps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(dt / SUB_DT)));
    const sdt = dt / substeps;

    const pulse = ph.pulse;
    const breath = ph.breath;
    const breathRate = ph.breathRate;

    let fidSum = 0;
    let latSum = 0;
    let lat0Sum = 0;
    let bwSum = 0;
    let wSum = 0;
    let rateSum = 0;
    const degraded = [];

    for (const [id, p] of this.pops) {
      const def = p.def;
      const nodes = p.nodes;

      /* ---- 1. local mechanics ---- */
      let load = 0;
      let rate = 0;
      let pressure = 0;
      let stiff = 0;
      let visc = 0;
      if (nodes.length) {
        for (const i of nodes) {
          load += s.load[i];
          rate += s.strainRate[i];
          pressure += s.pressure[i];
          stiff += s.stiffness[i];
          visc += s.viscosity[i];
        }
        const inv = 1 / nodes.length;
        load *= inv;
        rate *= inv;
        pressure *= inv;
        stiff *= inv;
        visc *= inv;
      }

      // The slowly-varying part of the stimulus each class is exposed to,
      // weighted by what it lives near.
      let base = load * 0.55 + pressure * 0.5;
      let oscAmp = 0;
      let oscHz = 0;
      switch (id) {
        case 'pacinian':
          // acceleration-coupled: sees the pressure wave and any transient, and
          // essentially nothing of the static load
          base += pulse * 0.5 + Math.abs(rate) * 0.05;
          oscAmp = 0.14 * (0.25 + pulse);
          oscHz = 38;
          break;
        case 'meissner':
          base += pulse * 0.2 + Math.abs(breathRate) * 0.08 + Math.abs(rate) * 0.03;
          oscAmp = 0.05;
          oscHz = 9;
          break;
        case 'ruffini':
          base += Math.abs(breath) * 0.28 + load * 0.35;
          break;
        case 'free':
          base += pressure * 0.6 + Math.abs(breath) * 0.1;
          break;
        case 'spindle':
          base += Math.abs(breath) * 0.2 + Math.abs(rate) * 0.06 + (this.store.physio.tone - 0.5) * 0.3;
          oscAmp = 0.03;
          oscHz = 6;
          break;
        case 'golgi':
          base += load * 0.6;
          break;
        case 'intero':
          base += ph.out.iap * 0.55 + ph.out.visceralMotion * 0.05 + Math.abs(breath) * 0.2;
          break;
        default:
          break;
      }

      /* ---- 2. viscoelastic transmission, 3. transduction ---- */
      const tau = this._tauAt(visc, stiff);
      // stiffening also attenuates: a stiffer path delivers less strain to the ending
      const attenuation = 1 / (1 + 1.35 * stiff + 0.6 * pressure);

      const transduce = (x, tonicF, phasicF, ampF, h) => {
        const tonic = tonicF.step(x, h);
        const phasic = phasicF.step(x, h);
        const mixed = lerp(tonic, Math.abs(phasic) * 3.2, def.phasic);
        const above = Math.max(0, mixed - def.threshold);
        // saturating compression, so strong events stop being distinguishable
        return { drive: ampF.step(above / (above + 0.55), h), above };
      };

      /* A Pacinian corpuscle works from 40 to 400 Hz; sampling its input once per
         rendered frame would alias that band into nonsense and report the ending
         as silent. Substepping keeps the fast classes representable. */
      let real = { drive: p.drive, above: 0 };
      let ref = { drive: p.idealDrive, above: 0 };
      let stim = 0;
      for (let k = 0; k < substeps; k++) {
        const tt = tBase + k * sdt;
        stim = clamp(base + (oscAmp ? oscAmp * Math.sin(tt * TAU * oscHz) : 0), 0, 2);
        p.transmitted = p.filter.step(stim, sdt, tau) * attenuation;
        real = transduce(p.transmitted, p.tonic, p.phasic, p.ampLP, sdt);
        // the same event, through healthy tissue
        const refTransmitted = p.refFilter.step(stim, sdt, TISSUE_TAU);
        ref = transduce(refTransmitted, p.refTonic, p.refPhasic, p.refAmpLP, sdt);
      }
      p.stimulus = stim;
      p.drive = real.drive;
      p.saturated = clamp((real.above - 0.75) / 0.75, 0, 1);
      p.idealDrive = ref.drive;

      /* ---- 4. rate coding ---- */
      const maxRate = def.bestHz * 1.6 + 8;
      const hz = p.rateLP.step(p.drive * maxRate, Math.max(dt, 1e-4));
      p.rate = hz;
      p.rateNorm = clamp(hz / maxRate, 0, 1);
      rateSum += hz;

      /* ---- 5. fidelity, latency, bandwidth ---- */
      // fidelity: the fraction of the achievable signal that actually arrived
      const fid = p.idealDrive > 2e-3 ? clamp(p.drive / p.idealDrive, 0, 1) : 1;

      // a first-order lag of time constant tau contributes ~tau of group delay at
      // the frequencies this class works in
      const omega = TAU * Math.max(0.2, def.bestHz);
      const lagOf = (t) => (t * p.filter.ratio) / (1 + Math.pow(omega * t, 2));
      const conductionS = 0.65 / Math.max(0.4, def.cvNum * (1 - 0.45 * stiff));
      const conduction0 = 0.65 / Math.max(0.4, def.cvNum);
      p.latency = (lagOf(tau) + tau * 0.06 * visc + conductionS) * 1000;
      p.latency0 = (lagOf(TISSUE_TAU) + conduction0) * 1000;

      // bandwidth: the −3 dB corner of the transmission path, relative to the
      // highest frequency this class is built to resolve
      const corner = 1 / (TAU * tau);
      const bw = clamp(corner / Math.max(0.4, def.bestHz), 0, 1);

      p.fidelity = fid;
      p.bandwidth = bw;
      p.dispersion = clamp(visc * 0.8 + stiff * 0.3, 0, 1);

      p.trace.push(p.drive);
      p.idealTrace.push(p.idealDrive);

      // weight the summary by how much traffic the class is actually generating
      const w = 0.35 + p.rateNorm;
      fidSum += fid * w;
      latSum += p.latency * w;
      lat0Sum += p.latency0 * w;
      bwSum += bw * w;
      wSum += w;

      if (fid < 0.72 || bw < 0.55) degraded.push({ id, name: def.short, fidelity: fid, bandwidth: bw });
    }

    /* ---- pathway aggregation ---- */
    for (const [, pw] of this.pathways) {
      pw.rate = 0;
      pw.fidelity = 0;
      pw.latency = 0;
      pw.amp = 0;
      pw._n = 0;
    }
    for (const [, p] of this.pops) {
      const key = this._pathwayFor(p.id);
      const pw = this.pathways.get(key);
      if (!pw) continue;
      pw.rate += p.rate;
      pw.fidelity += p.fidelity;
      pw.latency += p.latency;
      pw.amp += p.drive;
      pw._n++;
    }
    for (const [, pw] of this.pathways) {
      const n = Math.max(1, pw._n);
      pw.fidelity /= n;
      pw.latency /= n;
      pw.amp = clamp(pw.amp / n, 0, 1);
      pw.rate = pw.rate / n;
    }

    const w = Math.max(1e-6, wSum);
    const su = this.summary;
    su.fidelity = clamp(fidSum / w, 0, 1);
    su.latency = latSum / w;
    su.latencyBaseline = lat0Sum / w;
    su.latencyAdded = Math.max(0, su.latency - su.latencyBaseline);
    su.bandwidth = clamp(bwSum / w, 0, 1);
    su.firing = rateSum;
    su.totalRate = rateSum;
    // Composite headline number. Timing is scored on *added* delay rather than
    // absolute delay, because a C-fibre's 100 ms conduction time is normal — the
    // thing worth flagging is delay the mechanical state introduced.
    const timing = clamp(1 - su.latencyAdded / 90, 0, 1);
    su.timing = timing;
    su.integrity = clamp(
      Math.pow(su.fidelity, 0.5) * Math.pow(su.bandwidth, 0.3) * Math.pow(timing, 0.2),
      0,
      1
    );
    su.degraded = degraded;
  }

  _pathwayFor(id) {
    switch (id) {
      case 'spindle':
      case 'golgi':
        return 'spinocerebellar';
      case 'free':
        return 'anterolateral';
      case 'intero':
        return 'vagal';
      default:
        return 'dorsalColumn';
    }
  }

  /** Snapshot for the inspector, restricted to one structure's receptor classes. */
  describeFor(receptorIds) {
    const out = [];
    for (const id of receptorIds || []) {
      const p = this.pops.get(id);
      if (!p) continue;
      out.push({
        id,
        name: p.def.name,
        short: p.def.short,
        color: p.def.color,
        adapt: p.def.adapt,
        band: p.def.band,
        fiber: p.def.fiber,
        group: p.def.group,
        cv: p.def.cv,
        target: p.def.target,
        rate: p.rate,
        rateNorm: p.rateNorm,
        fidelity: p.fidelity,
        latency: p.latency,
        bandwidth: p.bandwidth,
        saturated: p.saturated,
        detects: p.def.detects,
      });
    }
    return out;
  }
}
