/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Materials for the atlas-instrument additions: outward efferent
   packet streams and the three teaching-overlay marker systems.

   Colour roles are locked product-wide and never shared between
   jobs (see README — Colour tokens):

     tension load        amber → copper      (network overlay)
     bone / compression  stone ivory-grey
     resting receptor    muted teal
     active receptor     cyan
     afferent packet     cyan → white, travelling inward
     somatic efferent    gold, travelling outward
     fusimotor efferent  thin gold-violet
     autonomic efferent  slow rose / magenta
     chiropractic marks  slate blue
     acupuncture marks   jade
     massage marks       sand

   Overlay colours are never reused for signals, and signal colours
   never appear on markers — direction and meaning stay legible by
   colour *and* by shape / motion.
   ============================================================ */

import * as THREE from 'three';
import { GLOBAL } from './materials.js';

/* ============================================================
   Efferent packet streams

   Same architecture as the afferent streams — baked path texture,
   per-route state texture, one draw call — but travelling outward
   (t increases distally) with per-route channel colour, and an
   arrival emphasis near the end of the path so delivery is legible
   as an event, not just a drift.

   State texture per route: r = spacing rate, g = amplitude,
   b = speed multiplier, a = channel (0 somatic, 1 fusimotor,
   2 autonomic).
   ============================================================ */

const EFF_VERT = /* glsl */ `
  attribute float aT;
  attribute float aPath;
  attribute float aSeed;

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform sampler2D tPaths;
  uniform vec2  uPathRes;
  uniform sampler2D tPathState;

  varying float vAmp;
  varying float vKind;
  varying float vArrive;
  varying vec3  vCol;

  vec3 pathAt(float pid, float t) {
    float y = (pid + 0.5) / uPathRes.y;
    float x = clamp(t, 0.0, 1.0) * (uPathRes.x - 1.0);
    float x0 = floor(x);
    float fx = x - x0;
    vec3 a = texture2D(tPaths, vec2((x0 + 0.5) / uPathRes.x, y)).xyz;
    vec3 b = texture2D(tPaths, vec2((min(x0 + 1.0, uPathRes.x - 1.0) + 0.5) / uPathRes.x, y)).xyz;
    return mix(a, b, fx);
  }

  void main() {
    vec4 st = texture2D(tPathState, vec2((aPath + 0.5) / uPathRes.y, 0.5));
    float amp = st.g;
    float speedMul = st.b;
    float kind = st.a;

    // outward: t increases toward the target
    float speed = mix(0.14, 0.46, speedMul) * (0.85 + 0.3 * aSeed);
    float t = fract(aT + uTime * speed);
    vec3 p = pathAt(aPath, t);

    // channel colours — somatic gold, fusimotor gold-violet, autonomic rose
    vec3 somatic  = vec3(1.00, 0.76, 0.28);
    vec3 fusi     = vec3(0.80, 0.62, 1.00);
    vec3 autonomic= vec3(1.00, 0.42, 0.62);
    vec3 col = kind < 0.5 ? somatic : (kind < 1.5 ? fusi : autonomic);

    // arrival flash: the last stretch of the path brightens and swells, so
    // delivery at the target reads as an event
    float arrive = smoothstep(0.86, 0.995, t);
    vArrive = arrive;
    vAmp = amp * (0.4 + 0.6 * st.r) * (1.0 + 1.4 * arrive);
    vKind = kind;
    vCol = mix(col, vec3(1.0, 0.97, 0.9), arrive * 0.55);

    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float thin = kind > 0.5 && kind < 1.5 ? 0.62 : 1.0; // fusimotor is the thin channel
    gl_PointSize = clamp(uSize * uPixelRatio * thin * (0.7 + 0.5 * amp + 0.8 * arrive), 1.5, 13.0);
  }
`;

const EFF_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vAmp;
  varying float vKind;
  varying float vArrive;
  varying vec3  vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = pow(1.0 - r, 3.4);
    float glow = pow(1.0 - r, 1.3) * 0.5;
    float a = (core + glow) * uOpacity * clamp(vAmp, 0.0, 1.4);
    gl_FragColor = vec4(vCol * (core * 1.2 + glow * 0.6 + 0.5 * vArrive), a);
  }
`;

export function efferentSignalMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: EFF_VERT,
    fragmentShader: EFF_FRAG,
    uniforms: {
      uTime: GLOBAL.uTime,
      uSize: { value: 4.2 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
      tPaths: { value: null },
      tPathState: { value: null },
      uPathRes: { value: new THREE.Vector2(1, 1) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ============================================================
   Teaching-overlay markers

   Matte, unlit-plus-rim discs / teardrops / ovals. They are chart
   symbols, not tissue: they must sit visually *on* the anatomy
   without pretending to be part of it, stay readable against any
   layer, and never bloom.
   ============================================================ */

export const OVERLAY_COLORS = {
  chiropractic: 0x7a92c4, // slate blue
  acupuncture: 0x4fb38b, // jade
  massage: 0xd9b98c, // sand
};

const MARKER_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iScale;
  attribute float iFade;
  varying vec3 vN;
  varying float vFade;
  void main() {
    vN = normalMatrix * normal;
    vFade = iFade;
    vec3 p = position * iScale + iOffset;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const MARKER_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vN;
  varying float vFade;
  void main() {
    vec3 n = normalize(vN);
    // simple two-tone shading + rim so the symbol reads as a solid chip
    float lift = 0.55 + 0.45 * clamp(n.y * 0.6 + n.z * 0.55, 0.0, 1.0);
    float rim = pow(1.0 - abs(n.z), 2.2) * 0.35;
    float a = uOpacity * vFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * lift + rim, a);
  }
`;

export function overlayMarkerMaterial(colorHex) {
  return new THREE.ShaderMaterial({
    vertexShader: MARKER_VERT,
    fragmentShader: MARKER_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.92 },
    },
    transparent: true,
    depthWrite: false,
    /* Chart symbols, not tissue: a contact point bound to a vertebra sits
       inside the body, and a depth-tested marker there would be invisible.
       Markers draw over the anatomy the way printed atlas symbols do. */
    depthTest: false,
  });
}

/** Selected-marker halo ring, drawn once around the active teaching point. */
export function markerHaloMaterial(colorHex) {
  return new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/* ---- marker geometries (unit size; instanced with iScale) ---- */

/** Chiropractic: a flat disc with a chevron notch — readable by shape alone. */
export function chiroGeometry() {
  const disc = new THREE.CylinderGeometry(1, 1, 0.24, 20, 1);
  disc.rotateX(Math.PI / 2);
  const chevron = new THREE.ConeGeometry(0.42, 0.9, 4);
  chevron.rotateX(Math.PI / 2);
  chevron.translate(0, 0.72, 0);
  return mergeGeoms([disc, chevron]);
}

/** Acupuncture: a teardrop — sphere body with a fine tip. */
export function acuGeometry() {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    // teardrop profile: round base narrowing to a point
    const r = Math.sin(t * Math.PI) * (1 - t * 0.42);
    pts.push(new THREE.Vector2(Math.max(1e-4, r), t * 2.2 - 1));
  }
  return new THREE.LatheGeometry(pts, 16);
}

/** Massage / myofascial: a flattened oval pad. */
export function massageGeometry() {
  const g = new THREE.SphereGeometry(1, 18, 12);
  g.scale(1.25, 0.42, 0.85);
  return g;
}

function mergeGeoms(list) {
  // minimal non-indexed merge — marker geometry, built once
  let total = 0;
  const parts = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.getAttribute('position').count;
    return ng;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array, o * 3);
    nor.set(g.getAttribute('normal').array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
