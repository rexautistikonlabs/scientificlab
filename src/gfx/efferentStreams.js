/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Efferent packet streams — outward traffic.

   The mirror of SignalStreams: routes descend from the brainstem /
   cord and travel *distally* along the same named trunks the
   afferent system ascends, so at region scale the outward paths are
   recognisable anatomy rather than random ribbons.

   Three channels ride the same texture machinery:

     somatic   (gold)        cord → limb trunks → muscle
     fusimotor (gold-violet) cord → muscle spindle beds, thin
     autonomic (rose)        brainstem → vagus (parasympathetic-like)
                             cord → splanchnic (sympathetic-like)

   Packet rate and brightness come from the live Efferent module.
   Shifting the autonomic balance visibly shifts traffic between the
   vagal and splanchnic routes — the two-tone made legible.
   ============================================================ */

import * as THREE from 'three';
import { spline, sample } from '../anatomy/build.js';
import { nerveTrunks } from '../anatomy/neuro.js';
import { VERTEBRAE } from '../anatomy/landmarks.js';
import { clamp, rng } from '../core/util.js';
import { efferentSignalMaterial } from './anatomyMaterials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SAMPLES = 64;

/** Cord centre-line brainstem → down to a given height (cranial → caudal). */
function cordDown(y0) {
  const pts = VERTEBRAE.filter((v) => v.pos.y >= y0 - 0.001 && v.region !== 'S')
    .slice()
    .sort((a, b) => b.pos.y - a.pos.y)
    .map((v) => V(0, v.pos.y, v.pos.z - 0.006));
  return [V(0, 1.668, 0.006), V(0, 1.645, -0.002), V(0, 1.6, -0.012), ...pts];
}

const KIND = { somatic: 0, fusimotor: 1, autonomic: 2 };

function buildRoutes() {
  const trunks = nerveTrunks();
  const byId = (id) => trunks.find((t) => t.id === id);
  const routes = [];
  const add = (id, name, kind, channel, pts) => {
    if (pts.length < 2) return;
    routes.push({ id, name, kind: KIND[kind], channel, points: pts });
  };

  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R';
    const lr = s > 0 ? 'left' : 'right';

    /* ---- somatic motor: cord → limb trunks, outward ---- */
    add(`mLeg:${tag}`, `Alpha drive · ${lr} posterior limb`, 'somatic', 'somatic',
      cordDown(0.99).concat(byId('sciatic').path(s), byId('tibial').path(s).slice(1)));
    add(`mLegAnt:${tag}`, `Alpha drive · ${lr} anterior limb`, 'somatic', 'somatic',
      cordDown(1.06).concat(byId('femoral').path(s), byId('peroneal').path(s).slice(1)));
    add(`mArm:${tag}`, `Alpha drive · ${lr} arm — median`, 'somatic', 'somatic',
      cordDown(1.44).concat(byId('brachialPlexus').path(s), byId('median').path(s).slice(1)));
    add(`mPhrenic:${tag}`, `Phrenic drive · ${lr} diaphragm`, 'somatic', 'somatic',
      cordDown(1.48).concat(byId('phrenic').path(s)));

    /* ---- fusimotor: thin gamma channel to spindle-rich beds ---- */
    add(`gCervical:${tag}`, `Gamma drive · ${lr} deep cervical`, 'fusimotor', 'fusimotor',
      cordDown(1.55).concat([
        V(s * 0.02, 1.545, -0.02),
        V(s * 0.036, 1.52, -0.006),
        V(s * 0.05, 1.5, 0.014),
      ]));
    add(`gCalf:${tag}`, `Gamma drive · ${lr} calf spindles`, 'fusimotor', 'fusimotor',
      cordDown(0.99).concat(byId('sciatic').path(s), byId('tibial').path(s).slice(1)));

    /* ---- autonomic: vagal descent vs splanchnic outflow ---- */
    add(`aVagal:${tag}`, `Vagal outflow · ${lr}`, 'autonomic', 'parasympathetic',
      [V(0, 1.66, 0.004), V(s * 0.02, 1.63, -0.016)].concat(byId('vagus').path(s)));
    add(`aSplanchnic:${tag}`, `Splanchnic outflow · ${lr}`, 'autonomic', 'sympathetic',
      cordDown(1.26).concat([
        V(s * 0.017, 1.24, -0.026),
        V(s * 0.017, 1.16, -0.024),
        V(s * 0.02, 1.1, -0.006),
        V(s * 0.02, 1.05, 0.02),
      ]));
  }
  return routes;
}

export class EfferentStreams {
  constructor(efferent, quality) {
    this.efferent = efferent;
    this.routes = buildRoutes();
    const P = this.routes.length;

    const data = new Float32Array(SAMPLES * P * 4);
    this.routes.forEach((r, pi) => {
      const curve = spline(r.points, 0.5);
      const pts = sample(curve, SAMPLES - 1);
      for (let i = 0; i < SAMPLES; i++) {
        const o = (pi * SAMPLES + i) * 4;
        const p = pts[i];
        data[o] = p.x;
        data[o + 1] = p.y;
        data[o + 2] = p.z;
        data[o + 3] = 1;
      }
    });
    this.pathTex = new THREE.DataTexture(data, SAMPLES, P, THREE.RGBAFormat, THREE.FloatType);
    this.pathTex.minFilter = this.pathTex.magFilter = THREE.NearestFilter;
    this.pathTex.needsUpdate = true;

    this.stateData = new Float32Array(P * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, P, 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.minFilter = this.stateTex.magFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;

    /* Interleaved particles, same as the afferent field, so quality subsampling
       thins every route instead of dropping whole ones. Efferent traffic is
       sparser than afferent by design — command is lower-bandwidth than sense. */
    const per = 56;
    this.perPath = per;
    this.pathCount = P;
    const count = per * P;
    const aT = new Float32Array(count);
    const aPath = new Float32Array(count);
    const aSeed = new Float32Array(count);
    const pos = new Float32Array(count * 3);
    const r = rng(9127);
    for (let k = 0; k < per; k++) {
      for (let pi = 0; pi < P; pi++) {
        const i = k * P + pi;
        aT[i] = k / per;
        aPath[i] = pi;
        aSeed[i] = r();
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geom.setAttribute('aPath', new THREE.BufferAttribute(aPath, 1));
    geom.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);

    this.material = efferentSignalMaterial();
    this.material.uniforms.tPaths.value = this.pathTex;
    this.material.uniforms.tPathState.value = this.stateTex;
    this.material.uniforms.uPathRes.value.set(SAMPLES, P);

    this.points = new THREE.Points(geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
    this.points.name = 'efferentSignals';

    this.density = 1;
    this.sizeFactor = 1;
    this._scaleFloat = 0;
    this.setDensity(quality?.high === false ? 0.55 : 1);
  }

  setPixelRatio(v) {
    this.material.uniforms.uPixelRatio.value = v;
  }

  setDensity(frac) {
    this.density = clamp(frac, 0.08, 1);
    const n = Math.max(4, Math.round(this.perPath * this.density));
    this.drawn = n * this.pathCount;
    this.points.geometry.setDrawRange(0, this.drawn);
  }

  setSizeFactor(f) {
    this.sizeFactor = f;
    this.setScale(this._scaleFloat);
  }

  setScale(scaleFloat) {
    this._scaleFloat = scaleFloat;
    this.material.uniforms.uSize.value = (3.6 + clamp(scaleFloat, 0, 4) * 0.8) * this.sizeFactor;
  }

  update(store) {
    const on = store.renderEnabled('efferent');
    this.points.visible = on && store.effectiveOpacity('nerve') > 0.004;
    if (!this.points.visible) return;
    this.material.uniforms.uOpacity.value = clamp(store.effectiveOpacity('nerve') * 1.1, 0, 1);

    const eff = this.efferent.out;
    const d = this.stateData;
    this.routes.forEach((r, i) => {
      const o = i * 4;
      let amp = 0;
      let speed = 0.6;
      switch (r.channel) {
        case 'somatic':
          amp = 0.15 + eff.somatic * 0.9;
          speed = 0.85;
          break;
        case 'fusimotor':
          amp = 0.06 + eff.fusimotor * 1.1;
          speed = 0.7;
          break;
        case 'sympathetic':
          amp = 0.1 + eff.sympathetic * 0.85;
          speed = 0.3; // autonomic is the slow channel
          break;
        case 'parasympathetic':
          amp = 0.1 + eff.parasympathetic * 0.85;
          speed = 0.3;
          break;
        default:
          break;
      }
      d[o] = clamp(amp, 0, 1.2); // r: modulates brightness with traffic
      d[o + 1] = clamp(amp, 0, 1.2); // g: amplitude
      d[o + 2] = speed; // b: speed multiplier
      d[o + 3] = r.kind; // a: channel id for colour
    });
    this.stateTex.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.pathTex.dispose();
    this.stateTex.dispose();
  }
}
