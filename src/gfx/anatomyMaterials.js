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
import { MAX_NODES } from '../sim/tensegrity.js';

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
   Tension-network cables — instanced camera-facing ribbons.

   One instance per element. Both endpoints and the load colour come
   from the SAME 256×1 field texture every tissue shader reads, so
   the cables ride the solve with zero per-frame CPU work: the old
   GL-line overlay rewrote two arrays per frame; this rewrites
   nothing. Width and the amber→copper ramp encode load; struts stay
   stone ivory at constant width, because compression cores do not
   "tighten".

   Drawn additively with no depth write: a luminous underlay beneath
   the anatomy, never a replacement for it.
   ============================================================ */

const CABLE_VERT = /* glsl */ `
  attribute vec3 iA;         // endpoint home positions
  attribute vec3 iB;
  attribute vec2 iNodes;     // solver node indices
  attribute float iKind;     // 0 cable, 1 strut

  uniform sampler2D tField;
  uniform float uDispScale;
  uniform vec3 uCamPos;
  uniform float uWidth;      // cable half-width at rest, metres

  varying float vT;          // packed load at this fragment (0.5 = rest)
  varying float vKind;
  varying float vS;          // -1..1 across the ribbon
  varying float vY;          // 0..1 along the element

  vec4 fieldAt(float idx) {
    return texture2D(tField, vec2((idx + 0.5) / ${MAX_NODES}.0, 0.5));
  }

  void main() {
    vec4 fa = fieldAt(iNodes.x);
    vec4 fb = fieldAt(iNodes.y);
    vec3 pa = iA + fa.xyz * uDispScale;
    vec3 pb = iB + fb.xyz * uDispScale;

    float t = position.y;      // 0..1 along the element
    float s = position.x;      // -1..1 across
    vT = mix(fa.w, fb.w, t);
    vKind = iKind;
    vS = s;
    vY = t;

    vec3 p = mix(pa, pb, t);
    vec3 axis = normalize(pb - pa + vec3(1e-9));
    vec3 view = normalize(uCamPos - p);
    vec3 across = normalize(cross(axis, view));

    // load thickens a cable; a strut keeps its bone-like constant girth
    float dev = clamp((vT - 0.5) * 4.0, 0.0, 1.4);
    float half_w = uWidth * (iKind > 0.5 ? 1.8 : 0.7 + 0.85 * dev);
    p += across * s * half_w;

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const CABLE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform float uTierFade;
  varying float vT;
  varying float vKind;
  varying float vS;
  varying float vY;
  void main() {
    // tube impostor: round profile across the ribbon, soft edges
    float r = clamp(abs(vS), 0.0, 1.0);
    float profile = sqrt(max(0.0, 1.0 - r * r));
    float dev = clamp((vT - 0.5) * 4.0, 0.0, 1.4);

    // the locked ramp: amber at rest → copper under load; struts stone ivory
    vec3 cable = mix(vec3(0.50, 0.38, 0.20), vec3(1.0, 0.44, 0.15), clamp(dev, 0.0, 1.0));
    cable = mix(cable, vec3(1.0, 0.62, 0.30), max(0.0, dev - 1.0)); // overload lifts toward hot
    vec3 strut = vec3(0.62, 0.60, 0.55);
    vec3 col = mix(cable, strut, vKind);

    // curvature shading so the ribbon reads as a rod, not a strip
    col *= 0.45 + 0.75 * profile;

    float a = uOpacity * uTierFade * profile * (vKind > 0.5 ? 0.55 : 0.35 + 0.85 * clamp(dev, 0.0, 1.0));
    gl_FragColor = vec4(col * (0.7 + 1.0 * clamp(dev, 0.0, 1.0) * (1.0 - vKind)), a);
  }
`;

export function networkCableMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CABLE_VERT,
    fragmentShader: CABLE_FRAG,
    uniforms: {
      tField: GLOBAL.tField,
      uDispScale: GLOBAL.uDispScale,
      uCamPos: GLOBAL.uCamPos,
      uWidth: { value: 0.0021 },
      uOpacity: { value: 0.5 },
      uTierFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Instanced ribbon geometry for the whole network: a 2-triangle quad per
 * element, endpoints and node indices baked once from the solver's homes.
 */
export function networkCableGeometry(solver, STRUT_KIND) {
  const quad = new THREE.PlaneGeometry(2, 1, 1, 3); // x: -1..1 across, y: 0..1 along
  quad.translate(0, 0.5, 0);
  const inst = new THREE.InstancedBufferGeometry();
  inst.index = quad.index;
  inst.setAttribute('position', quad.getAttribute('position'));

  const m = solver.elemCount;
  const A = new Float32Array(m * 3);
  const B = new Float32Array(m * 3);
  const N = new Float32Array(m * 2);
  const K = new Float32Array(m);
  for (let e = 0; e < m; e++) {
    const a = solver.ea[e];
    const b = solver.eb[e];
    A[e * 3] = solver.home[a * 3];
    A[e * 3 + 1] = solver.home[a * 3 + 1];
    A[e * 3 + 2] = solver.home[a * 3 + 2];
    B[e * 3] = solver.home[b * 3];
    B[e * 3 + 1] = solver.home[b * 3 + 1];
    B[e * 3 + 2] = solver.home[b * 3 + 2];
    N[e * 2] = a;
    N[e * 2 + 1] = b;
    K[e] = solver.ekind[e] === STRUT_KIND ? 1 : 0;
  }
  inst.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3));
  inst.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
  inst.setAttribute('iNodes', new THREE.InstancedBufferAttribute(N, 2));
  inst.setAttribute('iKind', new THREE.InstancedBufferAttribute(K, 1));
  inst.instanceCount = m;
  inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
  return inst;
}

/* ============================================================
   Acupuncture schematic channels — dashed jade polylines.

   Partial segments between the atlas points of the SAME named
   meridian only, and always captioned: "schematic teaching channel
   — not a tissue in this model." They are diagram ink, not anatomy:
   dashed, unlit, and they vanish with the overlay.
   ============================================================ */

export function channelDashMaterial() {
  return new THREE.LineDashedMaterial({
    // brighter than the marker jade: 1-px diagram ink needs the contrast
    color: 0x6fe6b8,
    transparent: true,
    opacity: 0.95,
    dashSize: 0.016,
    gapSize: 0.012,
    depthWrite: false,
    depthTest: false,
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
