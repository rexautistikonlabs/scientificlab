/* ============================================================
   Material library.

   Every tissue shares one vertex program. It reads the solved
   tensegrity field from a 256×1 float texture and does two things
   with it: displaces the vertex (so breathing, pulse and applied
   load physically move the tissue) and carries the local tension
   through to the fragment stage (so the whole body colours by
   force in real time).

   Lighting is a hand-built three-light rig rather than PBR — the
   look is a calibrated instrument, not a photograph, and it costs
   a fraction of a standard material.
   ============================================================ */

import * as THREE from 'three';
import { MAX_NODES } from '../sim/tensegrity.js';

/** Uniforms shared by every tissue material — updated once per frame. */
export const GLOBAL = {
  tField: { value: null },
  uTime: { value: 0 },
  uPulse: { value: 0 }, // 0..1 cardiac phase envelope
  uBreath: { value: 0 }, // -1..1 respiratory phase
  uForceColor: { value: 1 },
  uDispScale: { value: 1 },
  uScaleTier: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  /* Quality controls. Both are written once per tier change, never per frame.
     uAlphaCut discards translucent fragments too faint to contribute, expressed
     as a fraction of the layer's own opacity — see the cut in TISSUE_FRAG.
     uCheapLight drops the specular term from the light rig. */
  uAlphaCut: { value: 0.02 },
  uCheapLight: { value: 0 },
  /* Depth-of-interest slab, in world distance from the camera. uCutDist is the
     near edge (0 disables the whole thing), uSlabFar the far edge. See cutFade(). */
  uCutDist: { value: 0 },
  uSlabFar: { value: 1e9 },
};

const COMMON_VERT = /* glsl */ `
  attribute float aNodeA;
  attribute float aNodeB;
  attribute float aNodeW;

  uniform sampler2D tField;
  uniform float uDispScale;
  uniform float uTime;
  uniform float uPulse;
  uniform float uBreath;
  uniform float uWobble;
  uniform float uLocalDisp;

  varying vec3  vWPos;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vLoad;
  varying float vRate;

  vec4 fieldAt(float idx) {
    return texture2D(tField, vec2((idx + 0.5) / ${MAX_NODES}.0, 0.5));
  }

  void main() {
    vec4 fa = fieldAt(aNodeA);
    vec4 fb = fieldAt(aNodeB);
    vec3 disp = mix(fb.xyz, fa.xyz, aNodeW);
    float load = mix(fb.w, fa.w, aNodeW);

    vec3 p = position + disp * uDispScale * uLocalDisp;

    // slow tissue creep so nothing is ever perfectly still
    if (uWobble > 0.0001) {
      float w = sin(position.y * 34.0 + uTime * 0.9) * cos(position.x * 41.0 - uTime * 0.72);
      p += normal * w * uWobble * (0.6 + 0.4 * uPulse);
    }

    vLoad = load;
    vRate = 0.0;
    vUv = uv;

    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWPos = wp.xyz;
    vNrm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const LIGHT_CHUNK = /* glsl */ `
  // Three-light instrument rig: cool key from upper front-left, warm fill from
  // lower right, and a cold back rim that separates layers in depth.
  // Directions are stored pre-normalised so no fragment pays for normalize().
  const vec3 KEY_DIR  = vec3(-0.420566, 0.720971, 0.550742);
  const vec3 FILL_DIR = vec3( 0.845873, -0.307590, 0.435752);
  const vec3 RIM_DIR  = vec3( 0.100830, 0.302491, -0.947805);
  const vec3 KEY_COL  = vec3(1.00, 0.98, 0.94);
  const vec3 FILL_COL = vec3(0.36, 0.48, 0.62);
  const vec3 RIM_COL  = vec3(0.42, 0.72, 0.86);

  uniform float uCheapLight;
  uniform float uCutDist;
  uniform float uSlabFar;

  /* Depth-of-interest slab — the deep-scale section.
     Two problems are solved by one function, and both of them cost a smoothstep
     because the distance to the camera is already needed for the view vector.

     In front: descending past the organ tier advances the near plane toward the
     look-at point, which is what lets you look inside a cavity without deleting
     the wall in front of it. As a raw near-plane clip that reads as a rendering
     artefact — a triangle simply stops existing mid-surface. Fading the last
     ~18 % of the approach to the plane reads the way a sectioned specimen does:
     the tissue thins out and opens.

     Behind: sectioning only the front is what made the deep tiers a coloured
     wash. From twelve centimetres away, inside the trunk, the far wall of the
     cavity is still drawn at full weight and fills the entire frame behind the
     subject, so nothing has a silhouette to read against. Fading tissue well
     past the focal depth turns that wash into a slab — the structure you flew to
     sits in front of a dark ground instead of in front of more torso, which is
     both how a real section looks and the only way the interior becomes legible.

     Because both terms lower alpha before the alpha-cut test, this removes fill
     rather than adding any. */
  float cutFade(float camDist) {
    if (uCutDist <= 0.0) return 1.0;
    float front = smoothstep(uCutDist, uCutDist * 1.18, camDist);
    float back = 1.0 - smoothstep(uSlabFar, uSlabFar * 1.55, camDist);
    return front * back;
  }

  vec3 shade(vec3 N, vec3 V, vec3 albedo, float rough, float spec) {
    // wrapped diffuse — subsurface-ish softness without the cost
    float wrapK = max((dot(N, KEY_DIR) + 0.32) / 1.32, 0.0);

    float nf = max(dot(N, FILL_DIR), 0.0);
    float nr = max(dot(N, RIM_DIR), 0.0);

    vec3 diff = albedo * (KEY_COL * wrapK * 0.78 + FILL_COL * nf * 0.42 + RIM_COL * nr * 0.24);
    diff += albedo * 0.09; // ambient floor

    /* Low tier: the full three-light rig, minus the specular term only.
       The first version of this dropped the fill and rim lights and kept the
       key — which is backwards. Two dot products cost almost nothing, while the
       half-vector normalise and the pow() are the expensive instructions in this
       function; and it is precisely the fill and the rim that give the muscle
       bellies and the organ surfaces their form. Losing them flattened the body
       into a red mass. Losing the specular highlight costs a small glint on the
       wettest surfaces and nothing else. */
    if (uCheapLight > 0.5) return diff;

    float shin = mix(96.0, 10.0, rough);
    vec3 h = normalize(KEY_DIR + V);
    float s = pow(max(dot(N, h), 0.0), shin) * spec;
    return diff + KEY_COL * s;
  }

  // The packed argument is the field texture's alpha, where 0.5 means resting
  // pre-tension. Unloaded tissue cools and desaturates; loaded tissue goes warm
  // then hot. Referencing the ramp to rest rather than to the running peak is
  // what keeps a healthy body showing its own tissue colours instead of reading
  // as uniformly hot.
  vec3 forceRamp(vec3 base, float packed, float amount) {
    float dev = (packed - 0.5) * 4.0;
    vec3 slack = mix(base * 0.55, base, 0.4);
    vec3 warm  = mix(base, vec3(1.00, 0.66, 0.20), 0.68);
    vec3 hot   = vec3(1.00, 0.30, 0.16);
    vec3 c = mix(slack, base, smoothstep(-0.85, -0.05, dev));
    c = mix(c, warm, smoothstep(0.12, 0.72, dev));
    c = mix(c, hot, smoothstep(0.7, 1.4, dev));
    return mix(base, c, amount);
  }
`;

const TISSUE_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uRough;
  uniform float uSpec;
  uniform float uRim;
  uniform float uEmissive;
  uniform float uForceColor;
  uniform float uForceAmount;
  uniform float uHighlight;
  uniform float uHover;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFacing;      // 1 = flip back-facing normals (double-sided shells)
  uniform float uStripe;      // fibre striation strength
  uniform float uStripeFreq;
  uniform float uXray;        // 1 = rim-dominant accumulation
  uniform float uXrayFloor;   // how much a face-on surface still contributes
  uniform float uOverlay;     // 1 = a research dataset is painted on this structure
  uniform vec3  uOverlayColor;
  uniform vec3  uCamPos;
  uniform float uAlphaCut;    // quality: see the cut below

  varying vec3  vWPos;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vLoad;

  ${LIGHT_CHUNK}

  void main() {
    // the length is needed for the soft section, so the normalise is done by hand
    vec3 toCam = uCamPos - vWPos;
    float camDist = max(length(toCam), 1e-6);
    vec3 V = toCam / camDist;
    vec3 N = normalize(vNrm);
    if (dot(N, V) < 0.0 && uFacing > 0.5) N = -N;

    // fresnel rim: the single most useful cue for reading layered translucency
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    /* Alpha is resolved before anything else is computed, so a fragment that
       cannot contribute is discarded before it pays for the force ramp, the
       striation and the light rig. The figure is a dozen overlapping translucent
       shells, and under rim-dominant accumulation the face-on interior of each
       one contributes very little; removing that overdraw keeps the silhouette,
       which is where layered anatomy is legible in the first place.

       The threshold is a fraction of the layer's *own* opacity, not an absolute
       alpha. An absolute cut is arbitrarily harsher on faint layers: at a cut of
       0.05 the skin envelope, whose interior sits around 0.011, disappeared
       entirely while a dense muscle lost nothing. Scaling by uOpacity thins
       every layer by the same proportion of its own silhouette, which also means
       opaque tissue and the thin high-floor ribbons are never touched at all.
       Selected and hovered structures are exempt outright, so nothing the user
       is actually working with can be thinned. */
    float edge = uXrayFloor + (1.0 - uXrayFloor) * fres;
    float alpha = uXray > 0.5
      ? clamp(uOpacity * edge, 0.0, 1.0)
      : clamp(uOpacity + fres * uOpacity * 0.5, 0.0, 1.0);
    alpha *= cutFade(camDist);
    float cut = (uHighlight + uHover > 0.001) ? 0.004 : max(0.004, uAlphaCut * uOpacity);
    if (alpha < cut) discard;

    vec3 albedo = forceRamp(uColor, vLoad, uForceColor * uForceAmount);

    /* A research overlay replaces the tissue's own colour with the dataset ramp.
       Driven by a per-structure uniform written only when the overlay changes,
       so an active dataset costs nothing per frame and the solved field texture
       stays the single source of mechanical truth. */
    if (uOverlay > 0.5) albedo = mix(albedo, uOverlayColor, 0.88);

    // fibre striation — reads as collagen / muscle direction under the light
    if (uStripe > 0.001) {
      float st = sin(vUv.y * uStripeFreq + vUv.x * 3.0) * 0.5 + 0.5;
      albedo *= mix(1.0, 0.78 + 0.34 * st, uStripe);
    }

    vec3 col;
    if (uXray > 0.5) {
      // Rim-dominant accumulation. A dozen translucent shells overlap at any
      // given pixel; if each contributed its full shaded value the sum would
      // clip to white. Weighting by fresnel means interiors are nearly free and
      // only silhouette edges register, which is what makes layered anatomy
      // readable — and it is order-independent, so no sorting is needed.
      col = shade(N, V, albedo, uRough, uSpec * 0.5) * (0.22 + 0.55 * fres);
      col += albedo * fres * uRim * 0.55;
    } else {
      col = shade(N, V, albedo, uRough, uSpec);
      col += albedo * fres * uRim * 0.6;
    }
    col += albedo * uEmissive;

    if (uHighlight > 0.001) {
      float band = smoothstep(0.42, 0.5, abs(fract(vUv.y * 2.0 - uTime * 0.35) - 0.5));
      vec3 hi = mix(vec3(0.35, 0.94, 1.0), vec3(1.0), 0.25);
      col += hi * uHighlight * (0.55 + 0.85 * fres + 0.3 * band);
      alpha = clamp(alpha + uHighlight * 0.42, 0.0, 1.0);
    }
    if (uHover > 0.001) {
      col += vec3(0.6, 0.9, 1.0) * uHover * (0.2 + 0.6 * fres);
      alpha = clamp(alpha + uHover * 0.16, 0.0, 1.0);
    }

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const BASE_UNIFORMS = () => ({
  uColor: { value: new THREE.Color(0xffffff) },
  uOpacity: { value: 1 },
  uRough: { value: 0.6 },
  uSpec: { value: 0.35 },
  uRim: { value: 0.45 },
  uEmissive: { value: 0.0 },
  uForceAmount: { value: 1.0 },
  uHighlight: { value: 0.0 },
  uHover: { value: 0.0 },
  uWobble: { value: 0.0 },
  uLocalDisp: { value: 1.0 },
  uFacing: { value: 0.0 },
  uStripe: { value: 0.0 },
  uStripeFreq: { value: 120.0 },
  uXray: { value: 0.0 },
  uXrayFloor: { value: 0.07 },
  uOverlay: { value: 0.0 },
  uOverlayColor: { value: new THREE.Color(0x4fd6e0) },
  uCamPos: GLOBAL.uCamPos,
  tField: GLOBAL.tField,
  uTime: GLOBAL.uTime,
  uPulse: GLOBAL.uPulse,
  uBreath: GLOBAL.uBreath,
  uForceColor: GLOBAL.uForceColor,
  uDispScale: GLOBAL.uDispScale,
  uAlphaCut: GLOBAL.uAlphaCut,
  uCheapLight: GLOBAL.uCheapLight,
  uCutDist: GLOBAL.uCutDist,
  uSlabFar: GLOBAL.uSlabFar,
});

/**
 * Tissue material.
 * @param {object} o
 *   color, opacity, rough, spec, rim, emissive, stripe
 *   mode: 'solid' (depth-sorted alpha) | 'xray' (order-independent accumulation)
 */
export function tissueMaterial(o = {}) {
  const u = BASE_UNIFORMS();
  u.uColor.value = new THREE.Color(o.color ?? 0xcccccc);
  u.uOpacity.value = o.opacity ?? 1;
  u.uRough.value = o.rough ?? 0.6;
  u.uSpec.value = o.spec ?? 0.3;
  u.uRim.value = o.rim ?? 0.45;
  u.uEmissive.value = o.emissive ?? 0;
  u.uForceAmount.value = o.forceAmount ?? 1;
  u.uWobble.value = o.wobble ?? 0;
  u.uLocalDisp.value = o.disp ?? 1;
  u.uStripe.value = o.stripe ?? 0;
  u.uStripeFreq.value = o.stripeFreq ?? 120;
  u.uFacing.value = o.doubleSide ? 1 : 0;

  const xray = o.mode === 'xray';
  u.uXray.value = xray ? 1 : 0;
  // thin ribbons (the myofascial lines) need a higher floor or they disappear
  // when seen face-on; broad shells need a very low one
  u.uXrayFloor.value = o.xrayFloor ?? 0.07;
  const m = new THREE.ShaderMaterial({
    vertexShader: COMMON_VERT,
    fragmentShader: TISSUE_FRAG,
    uniforms: u,
    transparent: xray || (o.opacity ?? 1) < 0.995,
    depthWrite: !xray && (o.opacity ?? 1) > 0.9,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    blending: xray ? THREE.CustomBlending : THREE.NormalBlending,
  });
  if (xray) {
    // premultiplied additive: independent of draw order, which is what makes a
    // dozen overlapping translucent systems legible at once
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneFactor;
    m.blendEquation = THREE.AddEquation;
  }
  m.userData.mode = o.mode || 'solid';
  m.userData.baseOpacity = o.opacity ?? 1;
  /* Recorded so the quality tier can drop back faces on weak hardware and put
     them back afterwards without the builders having to know about quality. */
  m.userData.wantDoubleSide = !!o.doubleSide;
  return m;
}

/* ============================================================
   Nerve / conduit material: a tube with travelling action potentials
   ============================================================ */

const NERVE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uRate;       // firing rate, Hz-ish → pulses per second
  uniform float uSpeed;      // conduction velocity along uv.y
  uniform float uFidelity;   // 1 = crisp, 0 = smeared
  uniform float uJitter;
  uniform float uSignals;
  uniform float uAmp;        // how much traffic this pathway is carrying, 0..1
  uniform float uHighlight;
  uniform float uHover;
  uniform float uRim;
  uniform vec3  uCamPos;
  varying vec3  vWPos;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vLoad;

  ${LIGHT_CHUNK}

  void main() {
    vec3 toCam = uCamPos - vWPos;
    float camDist = max(length(toCam), 1e-6);
    vec3 V = toCam / camDist;
    vec3 N = normalize(vNrm);
    vec3 albedo = forceRamp(uColor, vLoad, 0.45);
    vec3 col = shade(N, V, albedo, 0.4, 0.5);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
    col += albedo * fres * uRim;

    // travelling depolarisation. Width and contrast both fall with fidelity, so a
    // filtered signal literally looks smeared as it climbs the pathway.
    if (uSignals > 0.5) {
      float phase = vUv.y * 1.0 - uTime * uSpeed;
      float n = max(uRate, 0.001);
      float band = fract(phase * n);
      float w = mix(0.34, 0.075, uFidelity);
      float pulse = smoothstep(w, 0.0, band) + smoothstep(1.0 - w, 1.0, band);
      pulse *= mix(0.35, 1.0, uFidelity);
      // conduction jitter → temporal dispersion
      pulse *= 1.0 - uJitter * 0.5 * (sin(vUv.y * 220.0 + uTime * 7.0) * 0.5 + 0.5);
      col += vec3(0.5, 0.88, 1.0) * pulse * (0.12 + 0.42 * uAmp);
    }

    col += vec3(0.35, 0.94, 1.0) * uHighlight * (0.6 + fres);
    col += vec3(0.6, 0.9, 1.0) * uHover * 0.3;
    float alpha = clamp(uOpacity + fres * 0.4, 0.0, 1.0) * cutFade(camDist);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export function nerveMaterial(o = {}) {
  const u = BASE_UNIFORMS();
  u.uColor.value = new THREE.Color(o.color ?? 0xf0b429);
  u.uOpacity.value = o.opacity ?? 0.95;
  u.uRate = { value: o.rate ?? 3.0 };
  u.uSpeed = { value: o.speed ?? 0.55 };
  u.uFidelity = { value: 1.0 };
  u.uJitter = { value: 0.0 };
  u.uSignals = { value: 1.0 };
  u.uAmp = { value: 0.4 };
  u.uRim.value = o.rim ?? 0.6;
  const m = new THREE.ShaderMaterial({
    vertexShader: COMMON_VERT,
    fragmentShader: NERVE_FRAG,
    uniforms: u,
    transparent: true,
    depthWrite: (o.opacity ?? 0.95) > 0.85,
  });
  m.userData.mode = 'nerve';
  m.userData.baseOpacity = o.opacity ?? 0.95;
  return m;
}

/* ============================================================
   Vessel material: pulsatile pressure wave travelling along the tree
   ============================================================ */

const VESSEL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFlow;       // flow speed along uv.y
  uniform float uWaveAmp;    // pulse-wave visibility
  uniform float uRim;
  uniform float uHighlight;
  uniform float uHover;
  uniform vec3  uCamPos;
  varying vec3  vWPos;
  varying vec3  vNrm;
  varying vec2  vUv;
  varying float vLoad;

  ${LIGHT_CHUNK}

  void main() {
    vec3 toCam = uCamPos - vWPos;
    float camDist = max(length(toCam), 1e-6);
    vec3 V = toCam / camDist;
    vec3 N = normalize(vNrm);
    vec3 albedo = forceRamp(uColor, vLoad, 0.35);
    vec3 col = shade(N, V, albedo, 0.32, 0.6);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
    col += albedo * fres * uRim;

    // pressure wave runs distally at the pulse-wave velocity, far faster than the
    // blood itself — two separate travelling terms
    float wave = sin((vUv.y * 6.0 - uTime * uFlow * 3.4)) * 0.5 + 0.5;
    col += albedo * wave * uWaveAmp * (0.35 + 0.9 * uPulse);
    float bolus = fract(vUv.y * 2.0 - uTime * uFlow * 0.6);
    col += albedo * smoothstep(0.85, 1.0, bolus) * 0.5;

    col += vec3(0.35, 0.94, 1.0) * uHighlight * (0.5 + fres);
    col += vec3(0.6, 0.9, 1.0) * uHover * 0.28;
    // rim-weighted like the other accumulating layers, with a high floor because
    // vessels are thin and must stay visible along their length
    float alpha = clamp(uOpacity * (0.5 + 0.5 * fres), 0.0, 1.0) * cutFade(camDist);
    col *= 0.62;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export function vesselMaterial(o = {}) {
  const u = BASE_UNIFORMS();
  u.uColor.value = new THREE.Color(o.color ?? 0xe8506b);
  u.uOpacity.value = o.opacity ?? 0.85;
  u.uFlow = { value: o.flow ?? 1.0 };
  u.uWaveAmp = { value: o.wave ?? 0.5 };
  u.uRim.value = o.rim ?? 0.5;
  const m = new THREE.ShaderMaterial({
    vertexShader: COMMON_VERT,
    fragmentShader: VESSEL_FRAG,
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
  });
  m.userData.mode = 'vessel';
  m.userData.baseOpacity = o.opacity ?? 0.85;
  return m;
}

/* ============================================================
   Receptor glyphs — instanced, one draw call per class
   ============================================================ */

const RECEPTOR_VERT = /* glsl */ `
  attribute vec3  aOffset;
  attribute float aNode;
  attribute float aPhase;
  attribute float aScale;

  uniform sampler2D tField;
  uniform float uDispScale;
  uniform float uTime;
  uniform float uSize;
  uniform float uFire;      // population firing 0..1
  uniform float uRateHz;

  varying float vLoad;
  varying float vFire;
  varying vec3  vNrm;
  varying vec3  vWPos;

  vec4 fieldAt(float idx) {
    return texture2D(tField, vec2((idx + 0.5) / ${MAX_NODES}.0, 0.5));
  }

  void main() {
    vec4 f = fieldAt(aNode);
    vLoad = f.w;

    // each ending fires on its own phase; the population is only loosely synchronous
    float ph = fract(uTime * uRateHz * (0.75 + 0.5 * aPhase) + aPhase);
    vFire = uFire * pow(1.0 - ph, 5.0);

    float s = uSize * aScale * (1.0 + vFire * 0.85);
    vec3 local = position * s;
    vec3 world = aOffset + f.xyz * uDispScale + local;

    vNrm = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(world, 1.0);
    vWPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RECEPTOR_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uHighlight;
  uniform vec3  uCamPos;
  varying float vLoad;
  varying float vFire;
  varying vec3  vNrm;
  varying vec3  vWPos;

  ${LIGHT_CHUNK}

  void main() {
    vec3 V = normalize(uCamPos - vWPos);
    vec3 N = normalize(vNrm);
    vec3 albedo = uColor;
    vec3 col = shade(N, V, albedo, 0.35, 0.4) * 0.7;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
    col += albedo * (0.5 + fres * 0.8);
    col += vec3(0.7, 1.0, 1.0) * vFire * 1.7;
    col += albedo * max(0.0, (vLoad - 0.5) * 4.0) * 0.28;
    col += vec3(0.35, 0.94, 1.0) * uHighlight;
    gl_FragColor = vec4(col * 0.8, clamp(uOpacity + vFire * 0.4, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function receptorMaterial(o = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: RECEPTOR_VERT,
    fragmentShader: RECEPTOR_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(o.color ?? 0xa58cff) },
      uOpacity: { value: o.opacity ?? 1 },
      uSize: { value: o.size ?? 1 },
      uFire: { value: 0 },
      uRateHz: { value: o.rate ?? 2 },
      uHighlight: { value: 0 },
      tField: GLOBAL.tField,
      uTime: GLOBAL.uTime,
      uDispScale: GLOBAL.uDispScale,
      uCamPos: GLOBAL.uCamPos,
      uCheapLight: GLOBAL.uCheapLight,
      uCutDist: GLOBAL.uCutDist,
      uSlabFar: GLOBAL.uSlabFar,
    },
    transparent: true,
    depthWrite: true,
  });
  m.userData.mode = 'receptor';
  m.userData.baseOpacity = o.opacity ?? 1;
  return m;
}

/* ============================================================
   Signal particles travelling afferent pathways
   ============================================================ */

const SIGNAL_VERT = /* glsl */ `
  attribute float aT;        // position along its path 0..1
  attribute float aPath;     // path id
  attribute float aSeed;

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform sampler2D tPaths;  // path sample positions (x) × paths (y)
  uniform vec2  uPathRes;
  uniform sampler2D tPathState; // per-path: r=rate g=fidelity b=latency a=amp

  varying float vAmp;
  varying float vFid;
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
    float rate = st.r;
    float fid = st.g;
    float lat = st.b;
    float amp = st.a;

    // travel proximally; conduction slows as tissue viscosity rises
    float speed = mix(0.16, 0.5, fid) * (0.8 + 0.4 * aSeed);
    float t = fract(aT + uTime * speed);
    vec3 p = pathAt(aPath, t);

    vAmp = amp * (0.35 + 0.65 * fid);
    vFid = fid;
    vCol = mix(vec3(1.0, 0.55, 0.28), vec3(0.45, 0.95, 1.0), fid);

    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Screen-constant size. Perspective sizing is wrong here: these are markers
    // for an event, and across a 1 m → 100 µm scale range a distance-divided size
    // becomes either invisible or a full-screen blob.
    gl_PointSize = clamp(uSize * uPixelRatio * (0.72 + 0.55 * amp), 1.5, 11.0);
  }
`;

const SIGNAL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vAmp;
  varying float vFid;
  varying vec3  vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // core tightens with fidelity — a degraded signal reads as a soft smear
    float core = pow(1.0 - r, mix(1.4, 4.5, vFid));
    float glow = pow(1.0 - r, 1.2) * 0.5;
    float a = (core + glow) * uOpacity * vAmp;
    gl_FragColor = vec4(vCol * (core * 1.15 + glow * 0.6), a);
  }
`;

export function signalMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SIGNAL_VERT,
    fragmentShader: SIGNAL_FRAG,
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
   Tensegrity network overlay
   ============================================================ */

const NET_VERT = /* glsl */ `
  attribute float aTension;
  attribute float aKind;
  uniform float uTime;
  varying float vT;
  varying float vKind;
  void main() {
    vT = aTension;
    vKind = aKind;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const NET_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vT;
  varying float vKind;
  void main() {
    // cables warm with tension; struts stay cold — the visual grammar of the
    // tension/compression distinction
    vec3 cable = mix(vec3(0.30, 0.62, 0.72), vec3(1.0, 0.42, 0.2), clamp(vT, 0.0, 1.0));
    vec3 strut = vec3(0.80, 0.86, 0.95);
    vec3 c = mix(cable, strut, vKind);
    float a = uOpacity * mix(0.35 + 0.85 * clamp(vT, 0.0, 1.0), 0.8, vKind);
    gl_FragColor = vec4(c * (0.7 + 1.1 * clamp(vT, 0.0, 1.0)), a);
  }
`;

export function networkMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: NET_VERT,
    fragmentShader: NET_FRAG,
    uniforms: { uOpacity: { value: 0.5 }, uTime: GLOBAL.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ============================================================
   Environment: ground pad + gradient backdrop
   ============================================================ */

export function backdrop() {
  // generous segment count: at these very low luminances a coarse sphere shows
  // its facets as visible banding
  const g = new THREE.SphereGeometry(30, 64, 40);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: GLOBAL.uTime },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        float h = d.y * 0.5 + 0.5;
        vec3 top = vec3(0.008, 0.013, 0.022);
        vec3 mid = vec3(0.016, 0.024, 0.036);
        vec3 bot = vec3(0.003, 0.005, 0.009);
        vec3 c = mix(bot, mid, smoothstep(0.0, 0.52, h));
        c = mix(c, top, smoothstep(0.5, 1.0, h));
        // faint cool pool behind the figure
        c += vec3(0.012, 0.028, 0.042) * pow(max(0.0, -d.z), 5.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

export function groundPad() {
  const g = new THREE.CircleGeometry(1.35, 72);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: GLOBAL.uTime, uPulse: GLOBAL.uPulse },
    vertexShader: `
      varying vec2 vP;
      void main(){ vP = position.xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uPulse;
      varying vec2 vP;
      void main(){
        float r = length(vP) / 1.35;
        float fall = pow(1.0 - clamp(r, 0.0, 1.0), 2.4);
        // measurement rings, so the ground reads as an instrument stage
        float ring = smoothstep(0.014, 0.0, abs(fract(r * 5.0) - 0.5) - 0.47);
        float sweep = smoothstep(0.05, 0.0, abs(fract(r * 5.0 - uTime * 0.06) - 0.5) - 0.45);
        vec3 c = vec3(0.06, 0.19, 0.23) * fall * 0.4;
        c += vec3(0.16, 0.42, 0.48) * ring * fall * 0.55;
        c += vec3(0.20, 0.55, 0.62) * sweep * fall * 0.22;
        gl_FragColor = vec4(c, (fall * 0.34 + ring * 0.3) * 0.85);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0.0005;
  mesh.renderOrder = -50;
  return mesh;
}
