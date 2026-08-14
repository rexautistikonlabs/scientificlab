/* ============================================================
   Lean hand-rolled post pipeline.

   scene → HDR target (MSAA) → soft bright pass → two-level
   separable blur → composite (exposure, ACES, bloom, vignette,
   dither). Deliberately much cheaper than a general-purpose
   composer: three fullscreen passes at reduced resolution.
   ============================================================ */

import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    // quadratic soft knee so highlights ramp instead of clipping on
    float k = uKnee + 1e-4;
    float soft = clamp(l - uThreshold + k, 0.0, 2.0 * k);
    soft = soft * soft / (4.0 * k);
    float w = max(soft, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * w, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uDir;        // texel-space direction
  varying vec2 vUv;
  void main() {
    // 9-tap gaussian collapsed to 5 bilinear fetches
    vec3 sum = texture2D(tSrc, vUv).rgb * 0.2270270270;
    vec2 o1 = uDir * 1.3846153846;
    vec2 o2 = uDir * 3.2307692308;
    sum += (texture2D(tSrc, vUv + o1).rgb + texture2D(tSrc, vUv - o1).rgb) * 0.3162162162;
    sum += (texture2D(tSrc, vUv + o2).rgb + texture2D(tSrc, vUv - o2).rgb) * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tBloomA;
  uniform sampler2D tBloomB;
  uniform float uExposure;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uChroma;
  uniform vec2  uRes;
  varying vec2 vUv;

  // ACES filmic approximation (Narkowicz) — keeps saturated emissives from clipping
  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    vec2 d = uv - 0.5;
    float r2 = dot(d, d);

    // very light lateral chromatic offset, only in the outer field
    vec3 col;
    if (uChroma > 0.0001) {
      float k = uChroma * r2;
      col.r = texture2D(tScene, uv - d * k).r;
      col.g = texture2D(tScene, uv).g;
      col.b = texture2D(tScene, uv + d * k).b;
    } else {
      col = texture2D(tScene, uv).rgb;
    }

    // uniform branch, so the two bloom fetches cost nothing on tiers without it
    if (uBloom > 0.001) {
      vec3 bloom = texture2D(tBloomA, uv).rgb * 0.62 + texture2D(tBloomB, uv).rgb * 0.38;
      col += bloom * uBloom;
    }

    col *= uExposure;
    col = aces(col);

    // vignette
    float vig = 1.0 - uVignette * smoothstep(0.18, 0.92, r2 * 1.9);
    col *= vig;

    // ordered-ish dither to kill banding in the deep gradients
    float n = fract(sin(dot(uv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * uGrain;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

class Quad {
  constructor(material) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  get material() {
    return this.mesh.material;
  }
  render(renderer, target) {
    renderer.setRenderTarget(target || null);
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function makeRT(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    ...opts,
  });
}

export class PostFX {
  constructor(renderer, { samples = 4, levels = 2 } = {}) {
    this.renderer = renderer;
    this.samples = samples;
    /** bloom levels: 2 = half + quarter res, 1 = half only, 0 = none */
    this.levels = levels;
    this.enabled = true;
    this.w = 1;
    this.h = 1;

    this.sceneRT = makeRT(1, 1, { depthBuffer: true, samples });
    this.a1 = makeRT(1, 1);
    this.a2 = makeRT(1, 1);
    this.b1 = makeRT(1, 1);
    this.b2 = makeRT(1, 1);

    this.bright = new Quad(
      new THREE.RawShaderMaterial({
        vertexShader: `precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.);} `,
        fragmentShader: BRIGHT_FRAG,
        uniforms: {
          tSrc: { value: null },
          uThreshold: { value: 1.02 },
          uKnee: { value: 0.3 },
        },
        depthTest: false,
        depthWrite: false,
      })
    );

    this.blur = new Quad(
      new THREE.RawShaderMaterial({
        vertexShader: `precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.);} `,
        fragmentShader: BLUR_FRAG,
        uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
        depthTest: false,
        depthWrite: false,
      })
    );

    this.composite = new Quad(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: COMPOSITE_FRAG,
        uniforms: {
          tScene: { value: null },
          tBloomA: { value: null },
          tBloomB: { value: null },
          uExposure: { value: 1.0 },
          uBloom: { value: 0.8 },
          uVignette: { value: 0.4 },
          uGrain: { value: 0.005 },
          uChroma: { value: 0.0016 },
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
        },
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  /**
   * Change the MSAA sample count. The sample count is baked into the render
   * target's framebuffer, so the target has to be rebuilt — which is why this is
   * a tier-change operation and never a per-frame one.
   */
  setSamples(n) {
    const s = Math.max(0, Math.min(8, n | 0));
    if (s === this.samples) return;
    this.samples = s;
    this.sceneRT.dispose();
    this.sceneRT = makeRT(this.w, this.h, { depthBuffer: true, samples: s });
  }

  /** 2 = half + quarter-res bloom, 1 = half only (four fewer blur passes), 0 = off. */
  setLevels(n) {
    this.levels = Math.max(0, Math.min(2, n | 0));
  }

  setSize(w, h, dpr = 1) {
    const W = Math.max(1, Math.floor(w * dpr));
    const H = Math.max(1, Math.floor(h * dpr));
    this.w = W;
    this.h = H;
    this.sceneRT.setSize(W, H);
    const hw = Math.max(1, W >> 1);
    const hh = Math.max(1, H >> 1);
    const qw = Math.max(1, W >> 2);
    const qh = Math.max(1, H >> 2);
    this.a1.setSize(hw, hh);
    this.a2.setSize(hw, hh);
    this.b1.setSize(qw, qh);
    this.b2.setSize(qw, qh);
    this.composite.material.uniforms.uRes.value.set(W, H);
  }

  set(key, value) {
    const u = this.composite.material.uniforms;
    if (key in u) u[key].value = value;
  }

  /** Full frame: render scene into HDR target, then composite to screen. */
  render(scene, camera, time) {
    const r = this.renderer;

    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    const cu = this.composite.material.uniforms;
    // with no bloom levels the blur targets are never written, so the composite
    // must not read them
    if (this.levels === 0) cu.uBloom.value = 0;
    const bloomStrength = cu.uBloom.value;
    const wide = this.levels >= 2;
    if (bloomStrength > 0.001 && this.levels > 0) {
      // bright pass at half res
      this.bright.material.uniforms.tSrc.value = this.sceneRT.texture;
      this.bright.render(r, this.a1);

      const bu = this.blur.material.uniforms;
      // half-res blur (two passes, separable)
      bu.tSrc.value = this.a1.texture;
      bu.uDir.value.set(1 / this.a1.width, 0);
      this.blur.render(r, this.a2);
      bu.tSrc.value = this.a2.texture;
      bu.uDir.value.set(0, 1 / this.a1.height);
      this.blur.render(r, this.a1);

      // quarter-res wide blur fed from the half-res result
      if (wide) {
        bu.tSrc.value = this.a1.texture;
        bu.uDir.value.set(1.6 / this.b1.width, 0);
        this.blur.render(r, this.b1);
        bu.tSrc.value = this.b1.texture;
        bu.uDir.value.set(0, 1.6 / this.b1.height);
        this.blur.render(r, this.b2);
        bu.tSrc.value = this.b2.texture;
        bu.uDir.value.set(2.4 / this.b1.width, 0);
        this.blur.render(r, this.b1);
        bu.tSrc.value = this.b1.texture;
        bu.uDir.value.set(0, 2.4 / this.b1.height);
        this.blur.render(r, this.b2);
      }
    }

    cu.tScene.value = this.sceneRT.texture;
    cu.tBloomA.value = this.a1.texture;
    // with one level the composite reads the same half-res result twice, so its
    // 0.62 / 0.38 weighting still sums to a full-strength bloom
    cu.tBloomB.value = wide ? this.b2.texture : this.a1.texture;
    cu.uTime.value = time;
    this.composite.render(r, null);
  }

  dispose() {
    for (const rt of [this.sceneRT, this.a1, this.a2, this.b1, this.b2]) rt.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
