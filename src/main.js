/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   CONTINUUM — application entry.

   Wiring order matters and is deliberate:
     network → solver → body geometry (bound to the network)
     → physiology (writes the network's rest state)
     → afferent model (reads the solved field)
     → signal streams, scale manager, UI.

   One solve per frame feeds everything: the deformation of every
   tissue, the colour of every surface, the firing of every receptor
   population and every number on the telemetry strip.
   ============================================================ */

import * as THREE from 'three';
import { store, SCALES, TOOLS } from './core/store.js';
import { Controls } from './core/controls.js';
import { ScaleManager } from './core/scales.js';
import { QualityController, detectHardware, TIERS } from './core/quality.js';
import { clamp, el, approach } from './core/util.js';
import { PostFX } from './gfx/postfx.js';
import { GLOBAL, backdrop, groundPad } from './gfx/materials.js';
import { SignalStreams, NetworkOverlay, MicroPulses } from './gfx/signals.js';
import { buildNetwork, Tensegrity } from './sim/tensegrity.js';
import { Physiology } from './sim/physiology.js';
import { Afferent } from './sim/afferent.js';
import { buildBody } from './anatomy/index.js';
import { setReceptorDensity } from './anatomy/receptors.js';
import { buildMicroAnatomy } from './anatomy/microanatomy.js';
import { buildSpindle, MICRO_ROIS } from './sim/spindle.js';
import { PROTOCOLS as MICRO_PROTOCOLS, simulateProtocol, peaksPerRepetition, ExtendedDrive } from './sim/spindle_extended.js';
import { P as P_MICRO, listParams, setParam, BLUM_2020 } from './data/micro/literature_params.js';
import { runExperiment as runMicroExperiment, summarise as summariseExperiment, PERTURBATIONS, perturbationTerms } from './sim/experiment.js';
import { LAYERS as MODEL_LAYERS, OUTPUTS as MODEL_OUTPUTS, layerOf, EXPERIMENT_CAPTION } from './platform/layers.js';
import { VALIDATION_ROWS, STATUS as VALIDATION_STATUS, summary as validationSummary, row as validationRow, withStatus, needsSourcing } from './platform/validation.js';
import { listAfferentParams, paramsForClass, provenanceSummary, rangeViolations, AP } from './data/afferent_params.js';
import { RECEPTORS } from './anatomy/info.js';
import { IdRegistry } from './platform/ids.js';
import { PropertyStore, registerReferenceData } from './platform/properties.js';
import { entitlements, CAPABILITIES as CAP_NAMES } from './platform/entitlements.js';
import { auth, PLANS } from './platform/auth.js';
import { Projects } from './platform/projects.js';
import { parseDataset, validateDataset } from './platform/datasets.js';
import { Measurements } from './tools/measure.js';
import { Annotations } from './tools/annotate.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { PremiumUI } from './ui/premium.js';
import { Workspace } from './ui/workspace.js';
import { Tour, TOUR_VERSION } from './ui/tour.js';
import { Disclaimer, mountPersistentNotice, DISCLAIMER_VERSION } from './ui/disclaimer.js';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ============================================================
   Boot
   ============================================================ */

const bootFill = el('#boot-fill');
const bootStage = el('#boot-stage');
const setBoot = async (label, t) => {
  bootStage.textContent = label;
  bootFill.style.width = `${Math.round(clamp(t) * 100)}%`;
  await raf();
  await raf();
};

async function main() {
  const canvas = el('#stage');

  /* ---------------- renderer ---------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA happens on the HDR target instead
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true, // essential for a 1 m → 100 µm depth range
      stencil: false,
    });
  } catch (e) {
    bootStage.textContent = 'WebGL2 is required';
    console.error(e);
    return;
  }
  if (!renderer.capabilities.isWebGL2) {
    bootStage.textContent = 'This tool requires a WebGL2-capable browser';
    return;
  }

  /* Hardware detection sets the starting tier and — the one irreversible
     decision — the tessellation level the geometry is built at. Everything else
     the quality controller changes is a uniform, a target size or a draw range. */
  const detected = detectHardware(renderer);
  const quality = { high: detected.geometry };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // handled in the composite pass
  renderer.setClearColor(0x04060a, 1);
  renderer.setPixelRatio(1); // the post chain owns resolution
  /* A frame is five or more render calls (scene, bright, four blurs, composite),
     and three.js resets its counters on every one of them. Without this the
     diagnostics would report the fullscreen composite quad and nothing else. */
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 40);
  scene.add(backdrop(), groundPad());

  const startTier = TIERS[detected.tier];
  let dpr = Math.min(window.devicePixelRatio || 1, startTier.dpr);
  let viewW = 0;
  let viewH = 0;
  const postfx = new PostFX(renderer, { samples: startTier.msaa, levels: startTier.bloomLevels });

  await setBoot('assembling tension network', 0.05);

  /* ---------------- mechanics ---------------- */
  const net = buildNetwork();
  const solver = new Tensegrity(net);
  GLOBAL.tField.value = solver.fieldTex;

  await setBoot('solving resting equilibrium', 0.09);
  // deterministic resting state: everything reported later is relative to this
  solver.settle();

  await setBoot(`${net.nodes.length} nodes · ${net.elements.length} elements`, 0.12);

  /* ---------------- identity ---------------- */
  // Assigned during the build, so no structure can exist without a permanent ID.
  const ids = new IdRegistry();

  /* ---------------- body ---------------- */
  const { registry, locator, receptors } = await buildBody({
    solver,
    quality,
    ids,
    onProgress: (label, t) => setBoot(`building ${label}`, 0.12 + t * 0.7),
  });
  scene.add(registry.root);

  if (ids.collisions.length) {
    console.warn('[continuum] anatomical ID collisions', ids.collisions);
  }

  await setBoot('building receptor micro-anatomy', 0.86);
  const micro = buildMicroAnatomy();
  scene.add(micro.root);

  /* ---------------- physiology & signalling ---------------- */
  const physio = new Physiology(solver, net, store);
  const afferent = new Afferent(solver, physio, store, receptors.populations);
  afferent.setFocus(store.microFocus);

  const signals = new SignalStreams(afferent, quality);
  signals.setPixelRatio(dpr);
  scene.add(signals.points);

  const overlay = new NetworkOverlay(solver);
  scene.add(overlay.group);

  /* ---------------- micro-mechanics ----------------
     One spindle in one network element, integrated at a fixed substep. It reads
     the solved element length directly, so its stretch, its firing rate and its
     spike times are consequences of the same solve that moves the whole body —
     there is no second physics here and no authored timing. */
  let microSpindle = buildSpindle(solver, store.micro.roi);
  if (!microSpindle) {
    console.warn('[continuum] no micro ROI resolved — Microscope mode will show geometry only');
  }

  /* The afferent axon leaving the ending. Parented to the micro root rather than
     to the spindle model, so the pulses are not stretched along with the capsule
     when the muscle lengthens. Coordinates are in units of the spindle's own
     length, which comes from the literature table. */
  const microPulses = (() => {
    const S = P_MICRO('spindleLength') * 1e-3; // mm → m
    const path = [
      new THREE.Vector3(S * 0.06, 0, 0),
      new THREE.Vector3(S * 0.42, S * 0.22, 0),
      new THREE.Vector3(S * 0.9, S * 0.52, S * 0.05),
      new THREE.Vector3(S * 1.5, S * 0.92, S * 0.12),
    ];
    const mp = new MicroPulses(path);
    mp.setPixelRatio(dpr);
    micro.root.add(mp.points);
    return mp;
  })();

  await setBoot('binding property layers', 0.9);

  /* ---------------- property layer ---------------- */
  const props = new PropertyStore({ ids, registry, solver, afferent }).buildBase();
  registerReferenceData(props);

  await setBoot('calibrating', 0.94);

  /* ---------------- camera & scales ---------------- */
  const controls = new Controls(camera, canvas);
  controls.target.set(0, 0.95, 0);
  controls.setSpan(SCALES[0].span * 1.05, true);

  const scales = new ScaleManager({ store, controls, registry, receptors, micro, signals, camera, spindle: microSpindle });
  scales.applyEntitlements();

  /* ============================================================
     Quality
     ============================================================ */

  /**
   * Push a tier into the renderer. Every line here is a uniform write, a target
   * size or a draw range — there is no geometry work and no per-mesh CPU work,
   * which is what makes a tier change safe to do mid-flight.
   */
  function applyQualityTier(tier) {
    GLOBAL.uAlphaCut.value = tier.alphaCut;
    GLOBAL.uCheapLight.value = tier.cheapLight;
    registry.setShellSides(tier.doubleSide);
    setReceptorDensity(receptors.populations, tier.receptors);
    signals.setDensity(tier.particles);
    signals.setSizeFactor(tier.signalSize);
    /* The micro pulses share the particle budget, because they are the same kind
       of cost. Density only changes how many in-flight spikes are *drawn* — the
       spike generator and the conduction delay are untouched, so a low tier shows
       a sparser axon with identical timing. */
    microPulses.setDensity(tier.particles);
    postfx.setSamples(tier.msaa);
    postfx.setLevels(tier.bloomLevels);
    postfx.set('uChroma', tier.chroma);
    postfx.set('uGrain', tier.grain);
  }

  /* Instantiated below, once the HUD exists: applying a tier resizes the render
     targets, and the HUD reports the buffer size. */
  let qualityCtl = null;

  /* ---------------- tools ---------------- */
  const overlayHost = el('#overlay-layer');
  const measures = new Measurements({ registry, props, solver, camera, canvas, overlayHost });
  const annotations = new Annotations({
    registry,
    solver,
    camera,
    canvas,
    overlayHost,
    onSelect: (id) => {
      const s = registry.byAnatomicalId(id);
      if (s) store.select(s.key, false);
    },
  });
  scene.add(measures.group, annotations.group);

  /* ---------------- ui ---------------- */
  const hud = new Hud(store, scales, afferent, physio, solver);

  qualityCtl = new QualityController({
    detected,
    onTier: (tier) => applyQualityTier(tier),
    onScale: (v) => setDpr(v),
  });
  // ?qlog traces every Auto decision to the console, for testing over a call
  if (/[?&]qlog\b/.test(location.search)) qualityCtl.trace(true);
  qualityCtl.setMode(store.render.quality);

  /** Full diagnostics blob — the thing a tester should send back. */
  function diagnostics() {
    return qualityCtl.diagnostics({
      scene: {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length ?? null,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        endingsDrawn: receptors.populations.reduce((n, p) => n + (p.drawn ?? p.count), 0),
        beadsDrawn: signals.drawn,
      },
      simulation: {
        cpuMsPerFrame: +cpuMs.toFixed(3),
        nodes: solver.count,
        elements: solver.elemCount,
        structures: registry.list.length,
        manifest: ids.manifestSignature(),
      },
      state: {
        tier: entitlements.tier,
        scaleTier: +scales.tier.toFixed(2),
        visibleLayers: [...store.layers.values()].filter((l) => store.effectiveOpacity(l.id) > 0.004).map((l) => l.id),
        overlay: props.activeOverlay?.id || null,
      },
    });
  }

  hud.onCopyDiagnostics = async () => {
    const text = JSON.stringify(diagnostics(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      hud.toast('Diagnostics copied to the clipboard', 2600);
    } catch {
      // clipboard needs a secure context and permission; the console always works
      // eslint-disable-next-line no-console
      console.info(text);
      hud.toast('Clipboard unavailable — diagnostics written to the console', 4200);
    }
  };

  const actions = {};
  const premium = new PremiumUI({ hud, onTierChange: () => applyTier() });
  // a click on a locked meter or the locked trace opens the plan, naming the
  // capability the user reached for
  hud.onLockedClick = (cap, label) => {
    entitlements.require(cap, { meter: label });
    premium.open(`${label} is part of the advanced instrument.`);
  };
  const panels = new Panels({ store, registry, afferent, solver, actions, props, premium });

  const projects = new Projects({
    store,
    registry,
    ids,
    solver,
    controls,
    scales,
    props,
    measures,
    annotations,
    physio,
  });
  const workspace = new Workspace({ store, props, projects, measures, annotations, hud, premium, actions });
  const tour = new Tour({ premium, scales, store });

  hud.onScaleClick((i) => scales.goToTier(i));

  /** next click places a note rather than selecting */
  let armedAnnotation = false;

  /**
   * Re-apply everything the licence governs. Called at start-up and on any tier
   * change, so upgrading takes effect immediately and without a reload.
   */
  function applyTier() {
    scales.applyEntitlements();
    registry.applyLayers(store, store.scaleFloat);
    premium.syncTier();
    premium.decorateSections();
    premium.decorateScaleRail(hud.railButtons);
    hud.syncEntitlements();
    panels.syncLayers();
    panels.syncReceptors();
    panels.syncChainChips();
    panels.syncGatedControls();
    panels.renderInspector();
    workspace.syncOverlays();
    workspace.syncPathologies();
    // a downgrade must un-paint an active research overlay, not merely grey out
    // the chip that selected it
    props.paintOverlay();
    if (!entitlements.can('tool.measure')) {
      workspace.setMeasureMode(null);
      armedAnnotation = false;
    }
    measures.setVisible(entitlements.can('tool.measure'));
    annotations.setVisible(entitlements.can('tool.annotate'));
  }

  /* ============================================================
     Interaction
     ============================================================ */

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const lastPick = { point: new THREE.Vector3(0, 1.2, 0), key: null };
  let hoverKey = null;
  let lastHoverAt = 0;
  let microWasActive = store.micro.active;

  store.on('layers', () => registry.applyLayers(store, store.scaleFloat));

  /* Changing the region rebinds the spindle to a different network element. The
     unit is rebuilt rather than mutated so its adaptation state, phase and spike
     history start clean — carrying them across would mean the first spikes after
     a change described the previous muscle. */
  store.on('micro', (k) => {
    if (k === 'model' && microSpindle) {
      microSpindle.setModel(store.micro.model);
      hud.toast(
        store.micro.model === 'extended'
          ? 'Microscope drive: <b>Extended</b> — tension and yank with stretch history. Simplified educational model, inspired by Blum et al. 2020.'
          : 'Microscope drive: <b>Basic</b> — the product default, firing from length and velocity.',
        5200
      );
    }
    if ((k === 'gammaStatic' || k === 'gammaDynamic') && microSpindle) {
      microSpindle.setGamma(k === 'gammaStatic' ? 'static' : 'dynamic', store.micro[k]);
      if (store.micro.model !== 'extended' && store.micro[k] > 0) {
        hud.toast('Fusimotor drive only affects the <b>Extended</b> model', 3400);
      }
    }
    if (k === 'scenario' && microSpindle) {
      const spec = store.micro.scenario ? MICRO_PROTOCOLS[store.micro.scenario] : null;
      if (spec) {
        microSpindle.startProtocol(spec);
        hud.toast(`Scenario <b>${spec.name}</b> — ${spec.blurb}`, 5200);
      } else {
        microSpindle.stopProtocol();
        hud.toast('Back to the <b>live body</b> length', 2600);
      }
    }
    if (k === 'roi') {
      const next = buildSpindle(solver, store.micro.roi);
      if (next) {
        next.setModel(store.micro.model);
        next.setGamma('static', store.micro.gammaStatic);
        next.setGamma('dynamic', store.micro.gammaDynamic);
        scales.spindle = next;
        microSpindle = next;
        hud.toast(`Microscope region: <b>${next.label}</b>`, 2600);
      } else {
        hud.toast('That region has no resolvable network element', 3600);
      }
    }

    /* Entering the mode once puts the spindle on screen, because the spindle is
       the only receptor v1 models mechanically — showing a Pacinian corpuscle
       under a caption about intrafusal stretch would be a lie about what is
       being computed. Only the *transition* forces it: picking another receptor
       while already inside stays picked, and the other models simply hold a
       fixed shape, which the read-out and the caption both make plain. */
    if (store.micro.active !== microWasActive) {
      microWasActive = store.micro.active;
      if (store.micro.active && store.microFocus !== 'spindle') store.setMicroFocus('spindle');
    }
  });

  store.on('render', (k) => {
    if (k === 'quality') {
      qualityCtl.setMode(store.render.quality);
      hud.toast(
        store.render.quality === 'auto'
          ? 'Quality <b>Auto</b> — holding 60 fps by adjusting render scale, then tier'
          : `Quality fixed at <b>${qualityCtl.tier.name}</b> — ${qualityCtl.tier.blurb}`,
        3600
      );
      if (qualityCtl.geometryShortfall) {
        hud.toast('Geometry was tessellated for this machine — reload to rebuild it at full detail', 5200);
      }
    } else if (k === 'perfHud') {
      hud.perfVisible(store.render.perfHud);
    }
  });

  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ptr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ptr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(registry.pickTargets(), false);
    if (!hits.length) return null;
    // prefer something actually visible: skip near-transparent envelopes unless
    // they are all there is
    let best = hits[0];
    for (const h of hits) {
      const s = h.object.userData.structure;
      if (!s) continue;
      const a = store.effectiveOpacity(s.layer) * s.opacityFactor;
      if (a > 0.3) {
        best = h;
        break;
      }
    }
    return best;
  }

  function structureTooltip(s) {
    const layer = store.layer(s.layer);
    const st = registry.stateOf(s);
    const parts = [
      `<div class="tt-sys" style="color:${layer?.color}">${layer?.name || s.layer}</div>`,
      `<div class="tt-name">${s.name}</div>`,
      `<div class="tt-line">tension <b>${
        Math.abs(st.dev) < 0.02 ? 'at rest' : `${st.dev > 0 ? '+' : ''}${(st.dev * 100).toFixed(0)}%`
      }</b>${
        st.stiffness > 0.01 ? ` · stiffened <b>+${(st.stiffness * 100).toFixed(0)}%</b>` : ''
      }${st.pressure > 0.01 ? ` · pressure <b>${(st.pressure * 100).toFixed(0)}%</b>` : ''}</div>`,
    ];
    return parts.join('');
  }

  canvas.addEventListener('pointermove', (e) => {
    if (controls.dragging) {
      hud.hideTooltip();
      return;
    }
    const now = performance.now();
    if (now - lastHoverAt < 55) return;
    lastHoverAt = now;
    const hit = pickAt(e.clientX, e.clientY);
    const key = hit?.object?.userData?.key || null;
    if (key !== hoverKey) {
      if (hoverKey) registry.setHover(hoverKey, 0);
      hoverKey = key;
      if (key) registry.setHover(key, 1);
      store.setHover(key);
      canvas.classList.toggle('pickable', !!key);
    }
    if (key) {
      const s = registry.get(key);
      if (s) hud.showTooltip(e.clientX, e.clientY, structureTooltip(s));
    } else {
      hud.hideTooltip();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (hoverKey) registry.setHover(hoverKey, 0);
    hoverKey = null;
    hud.hideTooltip();
  });

  canvas.addEventListener('click', (e) => {
    if (controls.dragged) return;
    const hit = pickAt(e.clientX, e.clientY);
    const struct = hit?.object?.userData?.structure || null;

    /* --- annotation placement takes the click --- */
    if (armedAnnotation) {
      if (!hit) {
        hud.toast('Click on a structure to pin a note to it');
        return;
      }
      annotations.add({ point: hit.point, structure: struct });
      armedAnnotation = false;
      canvas.classList.remove('measuring');
      workspace.renderMeasureList();
      return;
    }

    /* --- measurement tools take the click --- */
    if (workspace.measureMode) {
      if (!hit) {
        hud.toast('Click on a structure to place a probe');
        return;
      }
      if (workspace.measureMode === 'distance') {
        const r = measures.addDistancePoint(hit.point, struct);
        hud.toast(
          r.state === 'awaiting'
            ? `First point on <b>${struct?.name || 'point'}</b> — click the second`
            : `Measured <b>${r.item.label || '—'}</b>`,
          2600
        );
      } else {
        const m = measures.addProbe(workspace.measureMode, hit.point, struct);
        if (m) hud.toast(`${workspace.measureMode === 'tension' ? 'Tension' : 'Signal'} probe on <b>${struct.name}</b>`, 2600);
      }
      workspace.renderMeasureList();
      return;
    }

    if (!hit) {
      if (!e.shiftKey) store.clearSelection();
      return;
    }
    lastPick.point.copy(hit.point);
    lastPick.key = hit.object.userData.key;
    store.select(lastPick.key, e.shiftKey);
  });

  canvas.addEventListener('dblclick', (e) => {
    const hit = pickAt(e.clientX, e.clientY);
    if (!hit) return;
    const s = registry.get(hit.object.userData.key);
    if (!s) return;
    store.select(s.key, false);
    scales.focus(s);
    hud.toast(`Framing <b>${s.name}</b>`);
  });

  /* ---------------- selection highlight ---------------- */
  store.on('selection', () => {
    for (const s of registry.list) {
      const want = store.selection.has(s.key) ? 1 : 0;
      if (s._hi !== want) registry.setHighlight(s.key, want);
    }
  });

  /* ============================================================
     Interventions
     ============================================================ */

  let ivSeq = 0;

  function selectionNodes(radius) {
    const keys = [...store.selection];
    const set = new Set();
    const center = new THREE.Vector3();
    let n = 0;
    for (const k of keys) {
      const s = registry.get(k);
      if (!s) continue;
      center.add(s.center);
      n++;
    }
    if (n) center.multiplyScalar(1 / n);
    // if the user clicked recently on a selected structure, load that spot
    const anchor = keys.includes(lastPick.key) ? lastPick.point : center;
    const r2 = radius * radius;
    for (const k of keys) {
      const s = registry.get(k);
      if (!s) continue;
      let added = 0;
      for (const i of s.nodes) {
        const dx = solver.home[i * 3] - anchor.x;
        const dy = solver.home[i * 3 + 1] - anchor.y;
        const dz = solver.home[i * 3 + 2] - anchor.z;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          set.add(i);
          added++;
        }
      }
      // a structure smaller than the radius still gets loaded at its nearest node
      if (!added && s.nodes.length) set.add(s.nodes[0]);
    }
    return { nodes: [...set], anchor };
  }

  actions.apply = () => {
    if (!entitlements.require('tool.intervention')) return;
    const keys = [...store.selection];
    if (!keys.length) {
      hud.toast('Select a structure first — click anything in the viewport');
      return;
    }
    const tool = TOOLS.find((t) => t.id === store.tool.mode);
    const { nodes, anchor } = selectionNodes(store.tool.radius);
    if (!nodes.length) {
      hud.toast('Nothing in range — widen the field radius');
      return;
    }

    if (store.tool.mode === 'release') {
      const target = new Set(nodes);
      let removed = 0;
      for (const r of [...store.restrictions]) {
        const iv = solver.interventions.find((x) => x.id === r.id);
        if (!iv) continue;
        let overlap = 0;
        for (const n of iv.nodes) if (target.has(n)) overlap++;
        if (overlap > 0) {
          solver.removeIntervention(r.id);
          store.removeRestriction(r.id);
          removed++;
        }
      }
      hud.toast(removed ? `Released <b>${removed}</b> load${removed > 1 ? 's' : ''}` : 'Nothing loaded here');
      return;
    }

    const id = `iv${++ivSeq}`;
    const names = keys.map((k) => registry.get(k)?.name).filter(Boolean);
    const label = names.length > 1 ? `${names.length} structures` : names[0] || 'selection';
    solver.addIntervention({
      id,
      kind: store.tool.mode,
      nodes,
      magnitude: store.tool.magnitude,
      center: anchor.clone(),
      radius: store.tool.radius,
      label,
    });
    store.addRestriction({
      id,
      kind: store.tool.mode,
      kindName: tool?.name || store.tool.mode,
      label: `${tool?.verb || 'Loaded'} · ${label}`,
      magnitude: store.tool.magnitude,
      radius: store.tool.radius,
      nodeCount: nodes.length,
      // recorded by ID so a saved project can rebuild the same load against a
      // future build, where node indices may differ
      targetIds: keys.map((k) => ids.idFor(k)).filter(Boolean),
    });
    hud.toast(
      `<b>${tool?.name}</b> applied to ${label} — ${nodes.length} network nodes. Watch the load redistribute.`,
      3400
    );
  };

  actions.release = () => {
    if (!store.restrictions.length) {
      hud.toast('Nothing is loaded');
      return;
    }
    solver.clearInterventions();
    store.clearRestrictions();
    hud.toast('All loads released — the network is returning to resting pre-tension');
  };

  actions.releaseOne = (id) => {
    solver.removeIntervention(id);
    store.removeRestriction(id);
  };

  actions.flyTo = (key) => {
    const s = registry.get(key);
    if (s) scales.focus(s);
  };

  actions.frameSelection = () => {
    const box = registry.frameOf([...store.selection]);
    if (box) scales.frame(box);
  };

  actions.isolateSelection = () => {
    const layers = new Set([...store.selection].map((k) => registry.get(k)?.layer).filter(Boolean));
    if (!layers.size) return;
    store.solo.clear();
    for (const l of layers) store.solo.add(l);
    store.emit('layers');
    hud.toast(`Isolated <b>${[...layers].length}</b> system${layers.size > 1 ? 's' : ''}`);
  };

  actions.hideSelection = () => {
    let n = 0;
    for (const k of store.selection) {
      const s = registry.get(k);
      if (s) {
        s.hidden = true;
        n++;
      }
    }
    registry.applyLayers(store, store.scaleFloat);
    store.clearSelection();
    hud.toast(`Hid <b>${n}</b> structure${n > 1 ? 's' : ''} — press <b>R</b> to restore`);
  };

  actions.chainSelect = (chainId, on) => {
    // selecting a continuity selects both of its instances, so loading it acts
    // on the whole path
    const keys = [`chain:${chainId}:L`, `chain:${chainId}:R`];
    if (on) {
      store.setLayerVisible('chains', true);
      for (const k of keys) if (registry.get(k)) store.selection.add(k);
    } else {
      for (const k of keys) store.selection.delete(k);
    }
    store.emit('selection');
  };

  actions.toast = (html) => hud.toast(html);

  actions.armAnnotation = () => {
    if (!entitlements.require('tool.annotate')) return;
    armedAnnotation = true;
    workspace.setMeasureMode(null);
    canvas.classList.add('measuring');
    hud.toast('Click any structure to pin a note to it');
  };

  actions.afterProjectLoad = () => {
    registry.applyLayers(store, store.scaleFloat);
    panels.syncLayers();
    panels.renderInspector();
    workspace.syncOverlays();
    workspace.syncPathologies();
  };

  actions.inspectReceptor = (id) => {
    if (!entitlements.require('scale.deep', { receptor: id })) return;
    store.setMicroFocus(id);
    afferent.setFocus(id);
    const key = `receptor:${id}`;
    if (registry.get(key)) store.select(key, false);
    // descend to the receptor tier, centred on a site where this class lives
    const site = { pacinian: 0, meissner: 1, ruffini: 2, free: 3, spindle: 4, golgi: 5, intero: 6 }[id] ?? 0;
    const pop = receptors.populations.find((p) => p.id === id);
    const target = new THREE.Vector3(0.03, 1.2, 0.05);
    if (pop && pop.offsets.length >= 3) {
      const idx = (site * 37) % pop.count;
      target.set(pop.offsets[idx * 3], pop.offsets[idx * 3 + 1], pop.offsets[idx * 3 + 2]);
    }
    controls.flyTo({ target, span: SCALES[4].span, duration: 2.2 });
    hud.toast(`Descending to a <b>${RECEPTORS[id].name}</b> — ${RECEPTORS[id].adapt}`, 3600);
  };

  /* ============================================================
     Keyboard
     ============================================================ */

  const help = el('#help');
  const closeHelp = () => (help.hidden = true);
  el('#help-x').addEventListener('click', closeHelp);
  el('#btn-help').addEventListener('click', () => (help.hidden = !help.hidden));
  help.addEventListener('click', (e) => {
    if (e.target === help) closeHelp();
  });
  // the top-bar frame-rate chip is the obvious place to reach for when a frame
  // rate looks wrong, so it opens the diagnostics rather than just reporting
  el('#perf').addEventListener('click', () => {
    store.setRender('perfHud', !store.render.perfHud);
    panels.syncRenderControls();
  });
  el('#btn-replay-intro').addEventListener('click', () => {
    closeHelp();
    tour.start({ force: true });
  });
  el('#btn-replay-start').addEventListener('click', () => {
    closeHelp();
    el('#start').hidden = false;
  });

  const playBtn = el('#btn-play');
  const syncPlay = () => {
    playBtn.innerHTML = `<span class="${store.physio.running ? 'ic-pause' : 'ic-play'}"></span><span class="tb-btn-lbl">${
      store.physio.running ? 'Running' : 'Held'
    }</span>`;
  };
  playBtn.addEventListener('click', () => {
    store.setPhysio('running', !store.physio.running);
    syncPlay();
  });
  syncPlay();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key;
    if (k >= '1' && k <= '5') {
      scales.goToTier(+k - 1);
      hud.toast(`<b>${SCALES[+k - 1].name}</b> scale · ${SCALES[+k - 1].note}`, 1800);
      return;
    }
    switch (k.toLowerCase()) {
      case 'escape':
        if (tour.running) tour.stop();
        else if (!help.hidden) closeHelp();
        else store.clearSelection();
        break;
      case 'm':
        if (e.shiftKey) {
          if (!entitlements.require('scale.deep', { mode: 'microscope' })) break;
          store.setMicroPinned(!store.micro.pinned);
          panels.syncMicroControls?.();
          hud.toast(
            store.micro.pinned
              ? '<b>Microscope mode pinned</b> — micro-mechanics on one region of interest'
              : 'Microscope mode released — it will follow camera distance again',
            3000
          );
        }
        break;
      case 'f':
        if (e.shiftKey) {
          store.setRender('perfHud', !store.render.perfHud);
          panels.syncRenderControls?.();
        } else {
          actions.frameSelection();
        }
        break;
      case 'r':
        for (const s of registry.list) s.hidden = false;
        store.clearSolo();
        registry.applyLayers(store, store.scaleFloat);
        controls.flyTo({ target: new THREE.Vector3(0, 0.95, 0), span: SCALES[0].span * 1.05, theta: 0.42, phi: Math.PI * 0.5 - 0.05 });
        hud.toast('View and visibility reset');
        break;
      case 'i':
        actions.isolateSelection();
        break;
      case 'x':
        actions.hideSelection();
        break;
      case 't':
        if (e.shiftKey) actions.release();
        else actions.apply();
        break;
      case ' ':
        e.preventDefault();
        store.setPhysio('running', !store.physio.running);
        syncPlay();
        break;
      case '?':
      case '/':
        help.hidden = !help.hidden;
        break;
      case 'p':
        premium.toggle();
        break;
      case 'd':
        workspace.setMeasureMode(workspace.measureMode === 'distance' ? null : 'distance');
        break;
      case 'n':
        actions.armAnnotation();
        break;
      case 's':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          el('#btn-proj-save').click();
        }
        break;
      default:
        break;
    }
  });

  /* ============================================================
     Resize
     ============================================================ */

  function resize(force = false) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (!force && w === viewW && h === viewH) return;
    viewW = w;
    viewH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    postfx.setSize(w, h, dpr);
    signals.setPixelRatio(dpr);
    microPulses.setPixelRatio(dpr);
    hud.setBufferSize(postfx.w, postfx.h);
  }

  /** Change the render scale. Reallocates five render targets, so it is debounced
      by the quality controller's cooldowns rather than called freely. */
  function setDpr(v) {
    const next = clamp(v, 0.4, 3);
    if (Math.abs(next - dpr) < 0.005) return;
    dpr = next;
    resize(true);
  }

  /* Resize is coalesced to one call per frame. A dragged window edge or an
     orientation change fires continuously, and each one reallocates the MSAA
     target and four blur targets — doing that per event is how a resize turns
     into a multi-second stall. */
  let resizePending = false;
  window.addEventListener('resize', () => {
    resizePending = true;
  });
  resize(true);

  /* ============================================================
     Frame loop
     ============================================================ */

  let last = performance.now();
  let uiAcc = 0;
  let cpuMs = 0;
  let hidden = document.hidden;

  /* Tab visibility. requestAnimationFrame stops in a background tab, so the
     first frame back would otherwise carry the entire hidden interval as one dt.
     The frame clock is reset on return and the quality controller is told to
     ignore the spike, so a session left in another tab for an hour resumes
     exactly where it was rather than exploding the solver or being demoted to
     the lowest tier for a frame that was never rendered. */
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!hidden) {
      last = performance.now();
      resizePending = true; // the window may have been resized while hidden
    }
  });

  /* WebGL context loss — a laptop waking from sleep, or a driver reset. Without
     this the canvas silently freezes with no indication why. */
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      hud.toast('<b>Graphics context lost</b> — reload to restore the view', 9000);
    },
    false
  );
  canvas.addEventListener('webglcontextrestored', () => {
    resize(true);
    hud.toast('Graphics context restored', 3000);
  });

  /* ---------------- apply the licence, then reveal ---------------- */
  applyTier();
  workspace.renderMeasureList();

  el('#boot').classList.add('gone');
  setTimeout(() => {
    el('#boot').remove();
  }, 900);

  /* ---------------- start screen, then the workspace ---------------- */

  const STARTED_KEY = 'continuum.started.v1';
  const seenStart = (() => {
    try {
      return localStorage.getItem(STARTED_KEY) === '1';
    } catch {
      return true; // no storage → do not gate the product behind a screen we cannot remember dismissing
    }
  })();
  const startEl = el('#start');

  function enterWorkspace() {
    try {
      localStorage.setItem(STARTED_KEY, '1');
    } catch {
      /* ignore */
    }
    startEl.hidden = true;
    for (const id of ['#topbar', '#panel-left', '#panel-right', '#telemetry', '#scalebar']) el(id).hidden = false;
    hud.perfVisible(store.render.perfHud);

    /* First run gets the guided tour; every later visit gets the one-line
       prompt. Showing both would be twice as much reading for half as much
       information. ?tour forces it, for testing and for demo links — it forces
       the tour only, never the disclaimer that precedes it. */
    const forceTour = /[?&]tour\b/.test(location.search);
    if (forceTour || !Tour.completed) {
      setTimeout(() => tour.start({ force: forceTour }), 700);
    } else {
      hud.toast(
        entitlements.isPremium
          ? 'Press <b>?</b> for the reference · wheel to traverse scale · click any structure'
          : 'Explorer edition — press <b>?</b> for the reference, or <b>P</b> to see what Professional adds',
        5600
      );
    }
  }

  el('#start-free-price').textContent = PLANS.explorer.price;
  el('#start-pro-price').textContent = `${PLANS.professional.price} ${PLANS.professional.cadence}`;
  el('#btn-start-free').addEventListener('click', () => enterWorkspace());
  el('#btn-start-pro').addEventListener('click', () => {
    enterWorkspace();
    premium.open();
  });

  /* Shown once per browser, and skippable with ?skip for testing and for demo
     links. The model is already built and rendering behind it, so this is a
     moment rather than a wait. */
  /* The gate goes first and everything else waits on it.
     Note that ?skip does not appear in this condition: the query string skips
     the start screen, which is marketing, and must not skip the disclaimer,
     which is not. Automated tests take the returning-user route instead, by
     seeding `continuum_disclaimer_v1` before load. */
  mountPersistentNotice();
  const disclaimer = new Disclaimer();
  disclaimer.require().then(() => {
    if (seenStart || /[?&]skip\b/.test(location.search)) enterWorkspace();
    else startEl.hidden = false;
  });

  function frame() {
    requestAnimationFrame(frame);

    const now = performance.now();
    // Math.max guards a non-monotonic clock: a negative timestep would run the
    // constraint solver backwards, and nothing downstream checks for that.
    const trueDt = Math.max(0, (now - last) / 1000);
    const raw = Math.min(0.25, trueDt);
    last = now;
    // some browsers keep ticking a hidden tab at ~1 Hz; there is nothing to show
    if (hidden) return;
    /* The simulation timestep is clamped well below the frame time it is given.
       On a machine holding 20 fps the model runs slightly slow rather than taking
       50 ms steps the constraint solver cannot integrate stably — a visualisation
       that drifts a little in time is honest; one that detonates is not. */
    const dt = Math.min(raw, 1 / 20);

    if (resizePending) {
      resizePending = false;
      resize();
    }

    /* Adaptive quality first: it measures the frame we have just displayed, and
       acting on it before doing this frame's work is what keeps the response
       within a frame of the problem. */
    qualityCtl.update(trueDt);

    /* ---- simulation ---- */
    const cpuStart = performance.now();
    const speed = store.physio.speed;
    if (store.physio.running) physio.step(dt, speed);
    solver.step(dt * (store.physio.running ? 1 : 0.35) || 1e-4);
    afferent.step(dt * (store.physio.running ? speed : 0.15));

    /* Micro-mechanics. Stepped with the *same* effective simulation time as
       everything else, so slowing the physiology slows the spike train with it
       and pausing stops it dead rather than letting it free-run. The unit does
       its own fixed-substep integration internally, so spike times do not depend
       on the frame rate. Cheap enough to run always: one element length, one
       rate evaluation and a phase accumulator. */
    if (microSpindle) microSpindle.step(store.physio.running ? dt * speed : 0);

    /* ---- camera & scale ----
       Wall-clock, not the clamped simulation timestep. The camera is
       presentation, not physics: a two-second cinematic descent has to take two
       seconds whether the machine is drawing sixty frames a second or eight.
       Driving it from the clamped dt made every transition run five times too
       long on slow hardware — precisely where an unfinished move is most likely
       to be read as the application having hung. */
    controls.update(raw);
    scales.update(raw);

    /* ---- global shader state ---- */
    GLOBAL.uTime.value += dt * (store.physio.running ? speed : 0.15);
    GLOBAL.uPulse.value = physio.pulse;
    GLOBAL.uBreath.value = physio.breath;
    // renderEnabled, not render.forceColor: a premium visualisation must not
    // survive a licence downgrade just because its flag is still set
    GLOBAL.uForceColor.value = store.renderEnabled('forceColor') ? 1 : 0;
    GLOBAL.uCamPos.value.copy(camera.position);
    /* Depth-of-interest slab. Active only once the near plane has begun advancing
       into the body — from the organ tier inward — so the coarse views are
       untouched and read exactly as before. The far edge sits a little past the
       look-at point, which puts the structure you flew to in front of the
       backdrop rather than in front of the rest of the torso. */
    if (controls.nearFrac > 0.02) {
      const focal = camera.position.distanceTo(controls.target);
      GLOBAL.uCutDist.value = camera.near;
      GLOBAL.uSlabFar.value = focal * 1.3;
    } else {
      GLOBAL.uCutDist.value = 0;
    }
    /* Steady the gross body motion in Microscope mode.

       This damps the *drawn* displacement only — the solver, the element length
       the spindle reads, and every number in the read-out are untouched. At a
       ten-millimetre view a body swaying with the breath makes the subject
       impossible to hold in frame; the point of the mode is to watch one ending,
       not to fight the camera. */
    const microSteady = store.micro.active && store.micro.steady;
    // deformation is exaggerated slightly at coarse scales so millimetre motion
    // is readable from across the room, and true at close range
    GLOBAL.uDispScale.value = approach(
      GLOBAL.uDispScale.value,
      microSteady ? 0.2 : scales.tier < 1.5 ? 1.5 : scales.tier < 2.6 ? 1.15 : 1.0,
      3,
      raw
    );

    /* ---- signal + overlay + world-space tools ---- */
    signals.update(store);
    // one dot per action potential in transit, placed by how long ago the spike
    // generator emitted it — not by a phase of its own
    microPulses.update(microSpindle, store.micro.active && micro.root.visible);
    overlay.update(store);
    measures.update();
    annotations.update();

    // nerve materials carry the live afferent state of their pathway
    for (const s of registry.ofLayer('nerve')) {
      const u = s.material?.uniforms;
      if (!u || !u.uRate) continue;
      const pw = afferent.pathways.get(s.pathway || 'dorsalColumn');
      const rate = pw ? clamp(1.2 + pw.rate * 0.22, 0.6, 16) : 3;
      u.uRate.value = rate;
      u.uFidelity.value = pw ? clamp(pw.fidelity, 0.05, 1) : 1;
      u.uJitter.value = pw ? clamp(1 - pw.fidelity, 0, 1) : 0;
      u.uAmp.value = pw ? clamp(pw.amp, 0, 1) : 0.3;
      u.uSignals.value = store.renderEnabled('signals') ? 1 : 0;
    }

    // receptor populations pulse at their computed rate
    for (const pop of receptors.populations) {
      const p = afferent.pops.get(pop.id);
      if (!p) continue;
      pop.material.uniforms.uFire.value = clamp(p.drive * 1.15, 0, 1);
      pop.material.uniforms.uRateHz.value = clamp(p.rate * 0.14, 0.15, 9);
    }
    // and the micro model's axon carries the focused class's traffic
    const mm = micro.models.get(store.microFocus);
    if (mm && mm.group.visible) {
      const p = afferent.pops.get(store.microFocus);
      for (const material of mm.materials) {
        const u = material.uniforms;
        if (u?.uRate) {
          u.uRate.value = clamp(0.8 + (p?.rate || 0) * 0.2, 0.4, 14);
          u.uFidelity.value = clamp(p?.fidelity ?? 1, 0.05, 1);
          u.uJitter.value = clamp(1 - (p?.fidelity ?? 1), 0, 1);
        }
      }
    }

    cpuMs = cpuMs * 0.9 + (performance.now() - cpuStart) * 0.1;

    /* ---- post ---- */
    renderer.info.reset();
    // the tier scales the user's bloom setting rather than replacing it, so the
    // slider keeps meaning the same thing on every machine
    postfx.set('uBloom', store.render.bloom * qualityCtl.tier.bloom);
    postfx.set('uExposure', store.render.exposure);
    postfx.render(scene, camera, GLOBAL.uTime.value);

    /* ---- ui, at a lower cadence ---- */
    uiAcc += raw;
    if (uiAcc > 1 / 24) {
      hud.update(uiAcc);
      panels.tick();
      hud.microVisible(store.micro.active && !!microSpindle?.resolved);
      if (microSpindle) hud.updateMicro(microSpindle);
      hud.updatePerf({
        quality: qualityCtl.stats(),
        info: renderer.info,
        cpuMs,
        endings: receptors.populations.reduce((n, p) => n + (p.drawn ?? p.count), 0),
        beads: signals.drawn,
        decisions: qualityCtl.decisions,
      });
      uiAcc = 0;
    }
  }

  requestAnimationFrame(frame);

  /**
   * Platform surface. Deliberately the same shape an embedding host or an API
   * client would want: address structures by anatomical ID, read their property
   * bag, register datasets and parameter sets, drive the licence.
   */
  window.CONTINUUM = {
    /* core engine */
    store,
    solver,
    physio,
    afferent,
    registry,
    scales,
    controls,
    scene,
    camera,
    renderer,
    /* rendering */
    signals,
    overlay,
    postfx,
    quality: qualityCtl,
    setDpr,
    /* validation helpers: one blob to send back, one table to read */
    diagnostics,
    qualityLog: () => qualityCtl.logText(),
    /* UI, for tests and for hosts that need to re-sync after changing state */
    panels,
    hud,
    /* platform */
    ids,
    props,
    entitlements,
    auth,
    projects,
    measures,
    annotations,
    /* convenience API, all ID-addressed */
    api: {
      manifest: () => ids.manifest(),
      signature: () => ids.manifestSignature(),
      get: (id) => props.bag(id),
      live: (id) => props.live(id),
      select: (id) => {
        const s = registry.byAnatomicalId(id);
        if (s) store.select(s.key, false);
        return !!s;
      },
      registerDataset: (d) => props.registerDataset(d),
      removeDataset: (id) => props.removeDataset(id),
      /* Check a dataset before shipping it, without loading it: the same
         validator the file picker uses. Accepts an object or JSON text. */
      validateDataset: (input) => (typeof input === 'string' ? parseDataset(input) : validateDataset(input)),
      registerPathology: (p) => props.registerPathology(p),
      setOverlay: (d) => props.setOverlay(d),
      applyPathology: (p) => props.applyPathology(p, store),
      clearPathology: (p) => props.clearPathology(p, store),
      setTier: (t) => entitlements.setTier(t),
      capabilities: () => Object.keys(CAP_NAMES).map((k) => ({ id: k, granted: entitlements.can(k) })),
      /* The entitlement seam. A host that already knows who the user is and what
         they have bought calls applyClaim and nothing else — every gate in the
         engine reads the result. */
      applyClaim: (claim) => entitlements.applyClaim(claim),
      claim: () => ({ ...entitlements.claim }),
      session: () => (auth.session ? { ...auth.session } : null),
    },
    /* Micro-mechanics, exposed for validation rather than authoring. The
       read-out here is the same unamplified bag the panel prints, and
       setParam moves a published constant inside its own literature range —
       there is no way through this surface to inject a spike time. */
    /* The guided tour, reachable from the console for testing. */
    tour: {
      start: (opts = { force: true }) => tour.start(opts),
      stop: () => tour.stop({ remember: false }),
      reset: () => Tour.reset(),
      completed: () => Tour.completed,
      record: () => Tour.record,
      version: TOUR_VERSION,
      get running() {
        return tour.running;
      },
      get step() {
        return tour.index;
      },
      steps: () => tour.steps.map((s) => s.id),
    },
    /* The gate, reachable from the console for testing. reset() clears the
       acknowledgment; the modal returns on the next load. */
    disclaimer: {
      reset: () => Disclaimer.reset(),
      acknowledged: () => Disclaimer.acknowledged,
      record: () => Disclaimer.record,
      version: DISCLAIMER_VERSION,
    },
    micro: {
      get spindle() {
        return microSpindle;
      },
      rois: MICRO_ROIS,
      params: () => listParams(),
      param: (id) => P_MICRO(id),
      setParam: (id, v) => setParam(id, v),
      readout: () => (microSpindle ? microSpindle.readout() : null),
      spikes: (window_s = 1) => (microSpindle ? microSpindle.recent(window_s) : []),

      /* ---- Extended model ----
         Simplified and educational, inspired by Blum et al. 2020
         (doi:10.7554/eLife.55177). Not a reproduction of that work.

         `simulate` is the headline hook: it runs a protocol through the same
         drive the interactive scenario uses, offline and at full temporal
         resolution, and hands back the trace. That is how the history and yank
         checks are made — a living body is never exactly the same stimulus
         twice, which is fine for watching and useless for measuring. */
      setModel: (m) => store.setMicro('model', m === 'extended' ? 'extended' : 'basic'),
      setGamma: (kind, v) => store.setMicro(kind === 'dynamic' ? 'gammaDynamic' : 'gammaStatic', v),
      protocols: () => Object.values(MICRO_PROTOCOLS).map((p) => ({ ...p })),
      runScenario: (id) => store.setMicro('scenario', id && MICRO_PROTOCOLS[id] ? id : null),
      simulate: (spec, opts) =>
        simulateProtocol(typeof spec === 'string' ? MICRO_PROTOCOLS[spec] : spec, opts),
      peaks: (spec, trace) => peaksPerRepetition(typeof spec === 'string' ? MICRO_PROTOCOLS[spec] : spec, trace),
      newDrive: () => new ExtendedDrive(),
      citation: () => ({ ...BLUM_2020 }),

      /* ---- controlled experiments ----
         Baseline and perturbed conditions of the same protocol, everything
         else held identical. What comes back is a prediction under the
         selected model, and `caption` is the sentence that must accompany it
         wherever it is reported. */
      perturbations: () => Object.values(PERTURBATIONS).map((p) => ({ ...p })),
      perturbationTerms: (mode, magnitude) => perturbationTerms(mode, magnitude),
      experiment: (specOrId, opts) =>
        runMicroExperiment(typeof specOrId === 'string' ? MICRO_PROTOCOLS[specOrId] : specOrId, opts),
      experimentSummary: (specOrId, opts) =>
        summariseExperiment(runMicroExperiment(typeof specOrId === 'string' ? MICRO_PROTOCOLS[specOrId] : specOrId, opts)),
      caption: () => EXPERIMENT_CAPTION,
    },

    /* How well grounded each module actually is. The counts here and the table
       in VALIDATION_MATRIX.md are checked against each other by
       tools/check-validation-matrix.mjs, so neither can drift alone. */
    validation: {
      summary: () => validationSummary(),
      rows: () => JSON.parse(JSON.stringify(VALIDATION_ROWS)),
      row: (id) => JSON.parse(JSON.stringify(validationRow(id))),
      status: () => JSON.parse(JSON.stringify(VALIDATION_STATUS)),
      withStatus: (s) => JSON.parse(JSON.stringify(withStatus(s))),
      needsSourcing: () => needsSourcing().map((r) => ({ id: r.id, module: r.module, status: r.status, next: r.next })),
    },

    /* Provenance for the 42 constants the whole-body afferent model reads.
       See AFFERENT_PARAMS.md for how to verify a row — one at a time, and only
       after reading the source. */
    afferentParams: {
      all: () => listAfferentParams(),
      forClass: (c) => paramsForClass(c),
      get: (c, p) => AP(c, p),
      summary: () => provenanceSummary(),
      rangeViolations: () => rangeViolations(),
    },

    /* Which layer any named output belongs to, and what it actually is. */
    layers: {
      all: () => JSON.parse(JSON.stringify(MODEL_LAYERS)),
      outputs: () => JSON.parse(JSON.stringify(MODEL_OUTPUTS)),
      of: (id) => layerOf(id),
      define: (id) => MODEL_OUTPUTS[id]?.definition ?? null,
    },
  };
}

main().catch((err) => {
  console.error(err);
  const s = el('#boot-stage');
  if (s) s.textContent = `initialisation failed — ${err?.message || err}`;
});
