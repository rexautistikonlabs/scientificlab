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
import { clamp, el, approach } from './core/util.js';
import { PostFX } from './gfx/postfx.js';
import { GLOBAL, backdrop, groundPad } from './gfx/materials.js';
import { SignalStreams, NetworkOverlay } from './gfx/signals.js';
import { buildNetwork, Tensegrity } from './sim/tensegrity.js';
import { Physiology } from './sim/physiology.js';
import { Afferent } from './sim/afferent.js';
import { buildBody } from './anatomy/index.js';
import { buildMicroAnatomy } from './anatomy/microanatomy.js';
import { RECEPTORS } from './anatomy/info.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';

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

  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const quality = { high: !mobile && cores >= 6 };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // handled in the composite pass
  renderer.setClearColor(0x04060a, 1);

  let dpr = Math.min(window.devicePixelRatio || 1, quality.high ? 1.75 : 1.25);
  renderer.setPixelRatio(1); // the post chain owns resolution

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 40);
  scene.add(backdrop(), groundPad());

  const postfx = new PostFX(renderer, { samples: quality.high ? 4 : 2 });

  await setBoot('assembling tension network', 0.05);

  /* ---------------- mechanics ---------------- */
  const net = buildNetwork();
  const solver = new Tensegrity(net);
  GLOBAL.tField.value = solver.fieldTex;

  await setBoot('solving resting equilibrium', 0.09);
  // deterministic resting state: everything reported later is relative to this
  solver.settle();

  await setBoot(`${net.nodes.length} nodes · ${net.elements.length} elements`, 0.12);

  /* ---------------- body ---------------- */
  const { registry, locator, receptors } = await buildBody({
    solver,
    quality,
    onProgress: (label, t) => setBoot(`building ${label}`, 0.12 + t * 0.7),
  });
  scene.add(registry.root);

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

  await setBoot('calibrating', 0.94);

  /* ---------------- camera & scales ---------------- */
  const controls = new Controls(camera, canvas);
  controls.target.set(0, 0.95, 0);
  controls.setSpan(SCALES[0].span * 1.05, true);

  const scales = new ScaleManager({ store, controls, registry, receptors, micro, signals, camera });

  /* ---------------- ui ---------------- */
  const hud = new Hud(store, scales, afferent, physio, solver);
  const actions = {};
  const panels = new Panels({ store, registry, afferent, solver, actions });

  hud.onScaleClick((i) => scales.goToTier(i));

  /* ============================================================
     Interaction
     ============================================================ */

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const lastPick = { point: new THREE.Vector3(0, 1.2, 0), key: null };
  let hoverKey = null;
  let lastHoverAt = 0;

  store.on('layers', () => registry.applyLayers(store, store.scaleFloat));

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

  actions.inspectReceptor = (id) => {
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
        if (!help.hidden) closeHelp();
        else store.clearSelection();
        break;
      case 'f':
        actions.frameSelection();
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
      default:
        break;
    }
  });

  /* ============================================================
     Resize
     ============================================================ */

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    postfx.setSize(w, h, dpr);
    signals.setPixelRatio(dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ============================================================
     Frame loop
     ============================================================ */

  let last = performance.now();
  let frameAvg = 1 / 60;
  let uiAcc = 0;
  let dprCooldown = 2;

  // reveal the interface
  el('#boot').classList.add('gone');
  setTimeout(() => {
    el('#boot').remove();
  }, 900);
  for (const id of ['#topbar', '#panel-left', '#panel-right', '#telemetry', '#scalebar']) el(id).hidden = false;
  hud.toast('Press <b>?</b> for the reference · wheel to traverse scale · click any structure', 5200);

  function frame() {
    const now = performance.now();
    const raw = Math.min(0.25, (now - last) / 1000);
    last = now;
    const dt = Math.min(raw, 1 / 20);
    frameAvg = frameAvg * 0.94 + raw * 0.06;

    /* adaptive resolution: protect the frame rate before anything else */
    dprCooldown -= raw;
    if (store.render.quality === 'auto' && dprCooldown <= 0) {
      const target = 1 / 58;
      if (frameAvg > 1 / 42 && dpr > 0.72) {
        dpr = Math.max(0.72, dpr - 0.12);
        resize();
        dprCooldown = 1.6;
      } else if (frameAvg < target && dpr < (quality.high ? 1.75 : 1.25)) {
        dpr = Math.min(quality.high ? 1.75 : 1.25, dpr + 0.08);
        resize();
        dprCooldown = 2.2;
      }
    }

    /* ---- simulation ---- */
    const speed = store.physio.speed;
    if (store.physio.running) physio.step(dt, speed);
    solver.step(dt * (store.physio.running ? 1 : 0.35) || 1e-4);
    afferent.step(dt * (store.physio.running ? speed : 0.15));

    /* ---- camera & scale ---- */
    controls.update(dt);
    scales.update(dt);

    /* ---- global shader state ---- */
    GLOBAL.uTime.value += dt * (store.physio.running ? speed : 0.15);
    GLOBAL.uPulse.value = physio.pulse;
    GLOBAL.uBreath.value = physio.breath;
    GLOBAL.uForceColor.value = store.render.forceColor ? 1 : 0;
    GLOBAL.uCamPos.value.copy(camera.position);
    // deformation is exaggerated slightly at coarse scales so millimetre motion
    // is readable from across the room, and true at close range
    GLOBAL.uDispScale.value = approach(
      GLOBAL.uDispScale.value,
      scales.tier < 1.5 ? 1.5 : scales.tier < 2.6 ? 1.15 : 1.0,
      3,
      dt
    );

    /* ---- signal + overlay ---- */
    signals.update(store);
    overlay.update(store);

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
      u.uSignals.value = store.render.signals ? 1 : 0;
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

    /* ---- post ---- */
    postfx.set('uBloom', store.render.bloom);
    postfx.set('uExposure', store.render.exposure);
    postfx.render(scene, camera, GLOBAL.uTime.value);

    /* ---- ui, at a lower cadence ---- */
    uiAcc += raw;
    if (uiAcc > 1 / 24) {
      hud.update(uiAcc);
      panels.tick();
      uiAcc = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  /* expose for debugging / integration */
  window.CONTINUUM = { store, solver, physio, afferent, registry, scales, controls, scene, renderer };
}

main().catch((err) => {
  console.error(err);
  const s = el('#boot-stage');
  if (s) s.textContent = `initialisation failed — ${err?.message || err}`;
});
