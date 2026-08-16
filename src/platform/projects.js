/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Project persistence.

   A project captures everything the user built: layer state, camera, applied
   interventions, annotations, measurements, overlays, pathology sets and
   physiology parameters.

   Every reference to a structure is an anatomical ID, never a build key, an
   index or a mesh. That is what lets a project saved today reload against a
   future build with different tessellation, different layer ordering or extra
   structures — the identity layer is the contract, and anything that cannot be
   resolved on load is reported rather than silently dropped.
   ============================================================ */

const STORE_KEY = 'continuum.projects.v1';
export const SCHEMA_VERSION = 1;

function readAll() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export class Projects {
  constructor(deps) {
    this.d = deps; // { store, registry, ids, solver, controls, scales, props, measures, annotations, physio }
  }

  list() {
    const all = readAll();
    return Object.values(all)
      .map((p) => ({ name: p.name, saved: p.saved, structures: p.counts }))
      .sort((a, b) => String(b.saved).localeCompare(String(a.saved)));
  }

  /* ============================================================
     Capture
     ============================================================ */

  capture(name) {
    const { store, registry, ids, solver, controls, props, measures, annotations } = this.d;

    const layers = {};
    for (const [id, l] of store.layers) layers[id] = { visible: l.visible, opacity: +l.opacity.toFixed(3) };

    // interventions become ID-keyed records: the node set is re-derived on load
    // from whatever structures those IDs resolve to
    const interventions = solver.interventions
      .filter((iv) => !String(iv.id).startsWith('path:'))
      .map((iv) => {
        const rec = store.restrictions.find((r) => r.id === iv.id);
        return {
          kind: iv.kind,
          magnitude: +iv.magnitude.toFixed(3),
          radius: +iv.radius.toFixed(4),
          label: iv.label,
          // which structures were selected when it was applied
          targets: (rec?.targetIds || []).slice(),
          center: iv.center ? [iv.center.x, iv.center.y, iv.center.z].map((v) => +v.toFixed(4)) : null,
        };
      });

    return {
      schema: SCHEMA_VERSION,
      name,
      saved: new Date().toISOString(),
      manifest: ids.manifestSignature(),
      counts: { structures: registry.list.length, annotations: annotations.count, measurements: measures.count },
      camera: {
        target: controls.target.toArray().map((v) => +v.toFixed(4)),
        span: +controls.span.toFixed(5),
        theta: +controls.theta.toFixed(4),
        phi: +controls.phi.toFixed(4),
      },
      layers,
      solo: [...store.solo],
      hidden: registry.list.filter((s) => s.hidden && s.id).map((s) => s.id),
      selection: [...store.selection].map((k) => ids.idFor(k)).filter(Boolean),
      activeChains: [...store.activeChains],
      receptorFilter: [...store.receptorFilter],
      microFocus: store.microFocus,
      physio: { ...store.physio },
      render: { ...store.render },
      tool: { ...store.tool },
      interventions,
      annotations: annotations.serialise(),
      measurements: measures.serialise(),
      data: props.serialise(),
    };
  }

  /* ============================================================
     Restore
     ============================================================ */

  apply(p) {
    const { store, registry, ids, solver, controls, props, measures, annotations } = this.d;
    const report = { unresolved: [], applied: 0, schema: p.schema, manifestMatch: null };

    if (p.manifest && ids.manifestSignature) {
      const now = ids.manifestSignature();
      report.manifestMatch = now.hash === p.manifest.hash;
    }

    /* layers */
    for (const [id, v] of Object.entries(p.layers || {})) {
      const l = store.layer(id);
      if (!l) continue;
      l.visible = !!v.visible;
      l.opacity = v.opacity ?? l.opacity;
    }
    store.solo.clear();
    for (const s of p.solo || []) store.solo.add(s);

    /* hidden structures, by ID */
    for (const s of registry.list) s.hidden = false;
    for (const id of p.hidden || []) {
      const s = registry.byAnatomicalId(id);
      if (s) s.hidden = true;
      else report.unresolved.push(id);
    }

    /* chains, receptors, physiology, render, tool */
    store.activeChains.clear();
    for (const c of p.activeChains || []) store.activeChains.add(c);
    if (p.receptorFilter) {
      store.receptorFilter.clear();
      for (const r of p.receptorFilter) store.receptorFilter.add(r);
    }
    if (p.microFocus) store.microFocus = p.microFocus;
    Object.assign(store.physio, p.physio || {});
    Object.assign(store.render, p.render || {});
    Object.assign(store.tool, p.tool || {});

    /* interventions — rebuilt through the normal solver path, so restored
       projects inherit exactly the verified mechanics */
    solver.clearInterventions();
    store.clearRestrictions();
    (p.interventions || []).forEach((iv, i) => {
      const nodes = new Set();
      const resolvedNames = [];
      for (const id of iv.targets || []) {
        const s = registry.byAnatomicalId(id);
        if (!s) {
          report.unresolved.push(id);
          continue;
        }
        resolvedNames.push(s.name);
        for (const n of s.nodes) nodes.add(n);
      }
      if (!nodes.size) return;
      const ivId = `proj${i}`;
      solver.addIntervention({
        id: ivId,
        kind: iv.kind,
        nodes: [...nodes],
        magnitude: iv.magnitude,
        radius: iv.radius,
        label: iv.label || resolvedNames.join(', '),
      });
      store.addRestriction({
        id: ivId,
        kind: iv.kind,
        kindName: iv.kind,
        label: iv.label || resolvedNames.join(', '),
        magnitude: iv.magnitude,
        radius: iv.radius,
        nodeCount: nodes.size,
        targetIds: (iv.targets || []).slice(),
      });
      report.applied++;
    });

    /* data layers */
    props.restore(p.data, store);

    /* annotations and measurements */
    annotations.restore(p.annotations);
    measures.restore(p.measurements);

    /* selection */
    store.selection.clear();
    for (const id of p.selection || []) {
      const s = registry.byAnatomicalId(id);
      if (s) store.selection.add(s.key);
    }

    /* camera last, so a fly-in lands on the restored scene */
    if (p.camera) {
      controls.snapTo({
        target: { x: p.camera.target[0], y: p.camera.target[1], z: p.camera.target[2] },
        span: p.camera.span,
        theta: p.camera.theta,
        phi: p.camera.phi,
      });
    }

    store.emit('layers');
    store.emit('selection');
    store.emit('chains');
    store.emit('receptors');
    store.emit('restrictions');
    store.emit('physio');
    store.emit('render');
    return report;
  }

  /* ============================================================
     Storage
     ============================================================ */

  save(name) {
    const clean = String(name || '').trim() || `Scene ${new Date().toLocaleString()}`;
    const all = readAll();
    all[clean] = this.capture(clean);
    const ok = writeAll(all);
    return { ok, name: clean };
  }

  load(name) {
    const all = readAll();
    const p = all[name];
    if (!p) return { ok: false, reason: 'not found' };
    return { ok: true, report: this.apply(p), project: p };
  }

  remove(name) {
    const all = readAll();
    delete all[name];
    writeAll(all);
  }

  /** JSON export for sharing or institutional archiving. */
  exportJson(name) {
    return JSON.stringify(this.capture(name || 'export'), null, 2);
  }

  importJson(text) {
    let p;
    try {
      p = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'not valid JSON' };
    }
    if (!p || typeof p !== 'object' || !p.layers) return { ok: false, reason: 'not a CONTINUUM project' };
    if (p.schema > SCHEMA_VERSION) return { ok: false, reason: `project schema v${p.schema} is newer than this build` };
    return { ok: true, report: this.apply(p), project: p };
  }
}
