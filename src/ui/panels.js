/* ============================================================
   Side panels: system layers, myofascial continuities, receptor
   classes, the inspector, and the intervention / physiology /
   render controls.
   ============================================================ */

import { el, make, clamp } from '../core/util.js';
import { LAYERS, TOOLS } from '../core/store.js';
import { CHAINS } from '../anatomy/chains.js';
import { RECEPTORS, RECEPTOR_ORDER, describe } from '../anatomy/info.js';
import { entitlements, CAPABILITIES } from '../platform/entitlements.js';

export class Panels {
  constructor({ store, registry, afferent, solver, actions, props, premium }) {
    this.store = store;
    this.registry = registry;
    this.afferent = afferent;
    this.solver = solver;
    this.actions = actions;
    this.props = props;
    this.premium = premium;

    this._rows = new Map();
    this._chainChips = new Map();
    this._recChips = new Map();
    this._gatedControls = [];
    this._inspKeys = '';
    this._liveNodes = null;

    this._buildLayers();
    this._buildChains();
    this._buildReceptors();
    this._buildMechControls();
    this._buildPhysioControls();
    this._buildRenderControls();
    this._bindGlobalButtons();

    store.on('layers', () => this.syncLayers());
    store.on('selection', () => this.renderInspector());
    store.on('chains', () => this.syncChains());
    store.on('receptors', () => this.syncReceptors());
    store.on('microFocus', () => this.syncReceptors());
    store.on('restrictions', () => this.renderRestrictions());

    this.syncLayers();
    this.syncChains();
    this.syncReceptors();
    this.renderInspector();
    this.renderRestrictions();
  }

  /* ============================================================
     Layers
     ============================================================ */

  _buildLayers() {
    const host = el('#layer-list');
    host.innerHTML = '';
    for (const def of LAYERS) {
      const row = make('div', 'lrow');
      const count = this.registry.ofLayer(def.id).length;
      row.innerHTML = `
        <span class="lr-dot" role="checkbox" tabindex="0" aria-label="${def.name} visibility"></span>
        <span class="lr-main">
          <span class="lr-name">${def.name}</span>
          <span class="lr-count">${count || (def.id === 'network' ? 'graph' : '—')}</span>
        </span>
        <span class="lr-tools">
          <input class="lr-alpha" type="range" min="0" max="100" value="${Math.round(def.opacity * 100)}"
                 aria-label="${def.name} opacity" title="Opacity">
          <button class="lr-solo" title="Isolate this system">S</button>
        </span>`;
      row.title = def.blurb;
      const dot = row.querySelector('.lr-dot');
      const main = row.querySelector('.lr-main');
      const alpha = row.querySelector('.lr-alpha');
      const solo = row.querySelector('.lr-solo');

      const toggle = () => this.store.toggleLayer(def.id);
      dot.addEventListener('click', toggle);
      dot.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle();
        }
      });
      main.addEventListener('click', toggle);
      alpha.addEventListener('input', () => this.store.setLayerOpacity(def.id, +alpha.value / 100));
      alpha.addEventListener('pointerdown', (e) => e.stopPropagation());
      solo.addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.toggleSolo(def.id);
      });

      host.appendChild(row);
      this._rows.set(def.id, { row, alpha, swatch: dot });
      dot.style.setProperty('--c', def.color);
    }
  }

  syncLayers() {
    const solo = this.store.solo;
    for (const [id, r] of this._rows) {
      const l = this.store.layer(id);
      const visible = this.store.effectiveOpacity(id) > 0.004 || (l.visible && !solo.size);
      r.row.classList.toggle('off', !l.visible || !visible);
      r.row.classList.toggle('solo', solo.has(id));
      r.row.classList.toggle('dim', solo.size > 0 && !solo.has(id));
      if (document.activeElement !== r.alpha) r.alpha.value = String(Math.round(l.opacity * 100));
    }
    this.premium?.decorateLayerRows(this._rows);
  }

  /* ============================================================
     Myofascial continuities
     ============================================================ */

  _buildChains() {
    const host = el('#chain-list');
    host.innerHTML = '';
    for (const c of CHAINS) {
      const chip = make('button', 'chip', `<i></i><span>${c.short}</span>`);
      chip.style.color = c.color;
      chip.title = c.blurb;
      chip.addEventListener('click', () => {
        this.store.toggleChain(c.id);
        this.actions.chainSelect?.(c.id, this.store.activeChains.has(c.id));
      });
      host.appendChild(chip);
      this._chainChips.set(c.id, chip);
    }
  }

  syncChains() {
    for (const [id, chip] of this._chainChips) chip.classList.toggle('on', this.store.activeChains.has(id));
  }

  /* ============================================================
     Receptor classes
     ============================================================ */

  _buildReceptors() {
    const host = el('#receptor-list');
    host.innerHTML = '';
    for (const id of RECEPTOR_ORDER) {
      const r = RECEPTORS[id];
      const chip = make('button', 'chip', `<i></i><span>${r.short}</span>`);
      chip.style.color = r.color;
      chip.title = `${r.name} — ${r.adapt}, ${r.band}. ${r.detects}\nFibre ${r.fiber} (group ${r.group}), ${r.cv} → ${r.target}.\nClick to show/hide; double-click to inspect its micro-anatomy.`;
      chip.addEventListener('click', () => {
        this.store.toggleReceptorClass(id);
        this.store.setMicroFocus(id);
        this.afferent.setFocus(id);
      });
      chip.addEventListener('dblclick', () => this.actions.inspectReceptor?.(id));
      host.appendChild(chip);
      this._recChips.set(id, chip);
    }
  }

  syncReceptors() {
    for (const [id, chip] of this._recChips) {
      chip.classList.toggle('on', this.store.receptorFilter.has(id));
      chip.style.outline = this.store.microFocus === id ? '1px solid currentColor' : 'none';
      chip.style.outlineOffset = '1px';
    }
    // the receptor layer itself is premium, so the whole class list follows it
    this.premium?.decorateChips([...this._recChips.values()], 'layers.advanced');
  }

  syncChainChips() {
    this.premium?.decorateChips([...this._chainChips.values()], 'layers.advanced');
  }

  /* ============================================================
     Controls
     ============================================================ */

  _slider(host, { label, min, max, step, value, format, onInput, title, cap }) {
    const row = make('div', 'ctrl');
    row.innerHTML = `
      <span class="ctrl-lbl">${label}</span>
      <span class="ctrl-val"></span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">`;
    if (title) row.title = title;
    const val = row.querySelector('.ctrl-val');
    const input = row.querySelector('input');
    // a control the licence does not cover is disabled rather than inert: a
    // slider that moves and changes nothing is worse than one that cannot move
    if (cap) {
      this._gatedControls.push({ cap, input, row, label });
    }
    const paint = () => {
      val.textContent = format(+input.value);
    };
    input.addEventListener('input', () => {
      paint();
      onInput(+input.value);
    });
    paint();
    host.appendChild(row);
    return { row, input, paint };
  }

  _segmented(host, { label, options, value, onPick, title }) {
    const row = make('div', 'ctrl');
    row.innerHTML = `<span class="ctrl-lbl">${label}</span><span class="ctrl-val"></span>`;
    if (title) row.title = title;
    const seg = make('div', 'ctrl-seg');
    const buttons = options.map((o) => {
      const b = make('button', o.id === value ? 'on' : '', o.name);
      if (o.blurb) b.title = o.blurb;
      b.addEventListener('click', () => {
        buttons.forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onPick(o.id);
        const v = row.querySelector('.ctrl-val');
        if (v) v.textContent = '';
      });
      seg.appendChild(b);
      return b;
    });
    row.appendChild(seg);
    host.appendChild(row);
    return { row, buttons };
  }

  _check(host, { label, value, onChange, title, cap }) {
    const wrap = make('label', 'ctrl-check');
    wrap.innerHTML = `<input type="checkbox" ${value ? 'checked' : ''}><span>${label}</span>`;
    if (title) wrap.title = title;
    const input = wrap.querySelector('input');
    input.addEventListener('change', () => onChange(input.checked));
    host.appendChild(wrap);
    if (cap) this._gatedControls.push({ cap, input, row: wrap, label });
    return input;
  }

  /**
   * Disable every control the licence does not cover, and label it so the reason
   * is obvious. Re-runnable on tier change.
   */
  syncGatedControls() {
    for (const g of this._gatedControls) {
      const granted = entitlements.can(g.cap);
      g.input.disabled = !granted;
      g.row.classList.toggle('ctrl-locked', !granted);
      if (!granted) {
        const info = CAPABILITIES[g.cap];
        g.row.title = `${g.label} — Professional${info?.blurb ? `. ${info.blurb}` : ''}`;
        g.row.onclick = () => this.premium?.open(`${info?.name || g.label} is a Professional feature.`);
      } else {
        g.row.onclick = null;
      }
    }
  }

  _buildMechControls() {
    const host = el('#mech-controls');
    host.innerHTML = '';
    this._segmented(host, {
      label: 'Mode',
      options: TOOLS.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb })),
      value: this.store.tool.mode,
      onPick: (id) => {
        this.store.setTool('mode', id);
        const t = TOOLS.find((x) => x.id === id);
        el('#mech-hint').textContent = t?.blurb || '';
      },
      title: 'What the intervention does to the selected tissue',
    });
    const hint = make('p', 'pnote');
    hint.id = 'mech-hint';
    hint.textContent = TOOLS.find((t) => t.id === this.store.tool.mode)?.blurb || '';
    host.appendChild(hint);

    this._slider(host, {
      label: 'Magnitude',
      min: 0,
      max: 100,
      step: 1,
      value: this.store.tool.magnitude * 100,
      format: (v) => `${v.toFixed(0)} %`,
      onInput: (v) => this.store.setTool('magnitude', v / 100),
      title: 'How strongly the intervention is applied',
    });
    this._slider(host, {
      label: 'Field radius',
      min: 1,
      max: 40,
      step: 0.5,
      value: this.store.tool.radius * 100,
      format: (v) => `${v.toFixed(1)} cm`,
      onInput: (v) => this.store.setTool('radius', v / 100),
      title: 'Radius of tissue affected around the contact point',
    });
  }

  _buildPhysioControls() {
    const host = el('#physio-controls');
    host.innerHTML = '';
    const p = this.store.physio;
    this._slider(host, {
      label: 'Heart rate',
      min: 38,
      max: 168,
      step: 1,
      value: p.heartRate,
      format: (v) => `${v.toFixed(0)} bpm`,
      onInput: (v) => this.store.setPhysio('heartRate', v),
      title: 'Cardiac cycle frequency; drives the pulse-pressure wave',
    });
    this._slider(host, {
      label: 'Respiratory rate',
      min: 4,
      max: 34,
      step: 0.5,
      value: p.respRate,
      format: (v) => `${v.toFixed(1)} /min`,
      onInput: (v) => this.store.setPhysio('respRate', v),
      title: 'Breaths per minute',
    });
    this._slider(host, {
      label: 'Breath depth',
      min: 5,
      max: 100,
      step: 1,
      value: p.breathDepth * 100,
      format: (v) => `${v.toFixed(0)} %`,
      onInput: (v) => this.store.setPhysio('breathDepth', v / 100),
      title: 'Commanded diaphragm and rib-cage excursion',
      cap: 'physio.advanced',
    });
    this._slider(host, {
      label: 'Myofascial tone',
      min: 0,
      max: 100,
      step: 1,
      value: p.tone * 100,
      format: (v) => `${v.toFixed(0)} %`,
      onInput: (v) => this.store.setPhysio('tone', v / 100),
      title: 'Global resting pre-tension of the whole network',
      cap: 'physio.advanced',
    });
    this._slider(host, {
      label: 'Visceral motility',
      min: 0,
      max: 100,
      step: 1,
      value: p.motility * 100,
      format: (v) => `${v.toFixed(0)} %`,
      onInput: (v) => this.store.setPhysio('motility', v / 100),
      title: 'Amplitude of gastric and intestinal motor activity',
      cap: 'physio.advanced',
    });
    this._slider(host, {
      label: 'Time rate',
      min: 10,
      max: 250,
      step: 5,
      value: p.speed * 100,
      format: (v) => `${(v / 100).toFixed(2)} ×`,
      onInput: (v) => this.store.setPhysio('speed', v / 100),
      title: 'Slow the physiology down to inspect a single cycle',
      cap: 'physio.advanced',
    });
  }

  /** Reflect render state a keyboard shortcut may have changed behind the panel. */
  syncRenderControls() {
    if (this._perfCheck) this._perfCheck.checked = this.store.render.perfHud;
  }

  _buildRenderControls() {
    const host = el('#render-controls');
    host.innerHTML = '';
    const r = this.store.render;
    this._check(host, {
      label: 'Colour tissue by force',
      value: r.forceColor,
      onChange: (v) => this.store.setRender('forceColor', v),
      title: 'Map the solved tension field onto every tissue surface',
      cap: 'viz.forceColor',
    });
    this._check(host, {
      label: 'Afferent signal streams',
      value: r.signals,
      onChange: (v) => this.store.setRender('signals', v),
      title: 'Draw travelling action potentials along the pathways',
      cap: 'viz.signals',
    });
    this._check(host, {
      label: 'Tension network overlay',
      value: r.network,
      onChange: (v) => {
        this.store.setRender('network', v);
        this.store.setLayerVisible('network', v);
      },
      title: 'Show the cables and struts the model is solved on',
      cap: 'viz.network',
    });
    this._slider(host, {
      label: 'Bloom',
      min: 0,
      max: 200,
      step: 5,
      value: r.bloom * 100,
      format: (v) => `${(v / 100).toFixed(2)}`,
      onInput: (v) => this.store.setRender('bloom', v / 100),
    });
    this._slider(host, {
      label: 'Exposure',
      min: 40,
      max: 200,
      step: 5,
      value: r.exposure * 100,
      format: (v) => `${(v / 100).toFixed(2)}`,
      onInput: (v) => this.store.setRender('exposure', v / 100),
    });
    this._segmented(host, {
      label: 'Quality',
      options: [
        { id: 'auto', name: 'Auto' },
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Med' },
        { id: 'high', name: 'High' },
        { id: 'ultra', name: 'Ultra' },
      ],
      value: r.quality,
      onPick: (v) => this.store.setRender('quality', v),
      title:
        'Auto measures the frame time and holds 60 fps by moving render scale first, then tier. ' +
        'Pick a tier to fix it.',
    });
    this._perfCheck = this._check(host, {
      label: 'Performance read-out',
      value: r.perfHud,
      onChange: (v) => this.store.setRender('perfHud', v),
      title: 'Frame time, draw calls, triangles, render scale and the active quality tier (⇧F)',
    });
  }

  _bindGlobalButtons() {
    el('#btn-all-on').addEventListener('click', () => this.store.showAll());
    el('#btn-solo-clear').addEventListener('click', () => {
      this.store.clearSolo();
      for (const s of this.registry.list) s.hidden = false;
      this.registry.applyLayers(this.store, this.store.scaleFloat);
    });
    el('#btn-apply').addEventListener('click', () => this.actions.apply?.());
    el('#btn-release').addEventListener('click', () => this.actions.release?.());
  }

  /* ============================================================
     Inspector
     ============================================================ */

  renderInspector() {
    const host = el('#insp-body');
    const keys = [...this.store.selection];
    this._liveNodes = null;

    if (!keys.length) {
      host.className = 'insp-empty';
      host.innerHTML = `
        <p>Click any structure to inspect its mechanical state, its sensory population, and the afferent pathway it feeds.</p>
        <p class="pnote">Shift-click to add to selection. Double-click to fly to it.</p>`;
      this._inspKeys = '';
      return;
    }

    host.className = '';
    if (keys.length > 1) {
      host.innerHTML = `
        <div class="insp-head">
          <div class="insp-kicker"><i style="color:#4fd6e0"></i>${keys.length} structures selected</div>
          <h3 class="insp-title">Combined selection</h3>
        </div>
        <dl class="kv" id="insp-multi-kv"></dl>
        <div class="insp-sub">Members</div>
        <div class="multi-list" id="insp-multi"></div>
        <div class="insp-actions">
          <button class="btn btn-sm" id="insp-frame">Frame</button>
          <button class="btn btn-sm" id="insp-isolate">Isolate layers</button>
          <button class="btn btn-sm" id="insp-clear">Clear</button>
        </div>`;
      const list = el('#insp-multi', host);
      const nodes = new Set();
      for (const k of keys) {
        const s = this.registry.get(k);
        if (!s) continue;
        for (const n of s.nodes) nodes.add(n);
        const item = make(
          'div',
          'multi-item',
          `<i style="color:${this.store.layer(s.layer)?.color || '#8ea8bd'}"></i><span>${s.name}</span><button title="Remove">×</button>`
        );
        item.querySelector('button').addEventListener('click', () => this.store.deselect(k));
        item.addEventListener('mouseenter', () => this.registry.setHover(k, 0.7));
        item.addEventListener('mouseleave', () => this.registry.setHover(k, 0));
        list.appendChild(item);
      }
      this._liveNodes = [...nodes];
      const kv = el('#insp-multi-kv', host);
      kv.innerHTML = `
        <dt>Mean tension vs. rest</dt><dd id="live-load">—</dd>
        <div class="bar"><i id="live-load-bar"></i></div>
        <dt>Bound network nodes</dt><dd>${this._liveNodes.length}</dd>
        <dt>Local stiffening</dt><dd id="live-stiff">—</dd>
        <dt>Local viscosity</dt><dd id="live-visc">—</dd>`;
      el('#insp-frame', host).addEventListener('click', () => this.actions.frameSelection?.());
      el('#insp-isolate', host).addEventListener('click', () => this.actions.isolateSelection?.());
      el('#insp-clear', host).addEventListener('click', () => this.store.clearSelection());
      this._inspKeys = keys.join('|');
      return;
    }

    /* ---- single structure ---- */
    const s = this.registry.get(keys[0]);
    if (!s) return;
    const layer = this.store.layer(s.layer);
    // Everything below comes from the property store, keyed by the structure's
    // permanent ID — base anatomy, any bound datasets, active parameter sets and
    // subject data all arrive through the same door.
    const bag = this.props?.bag(s.id);
    const info = bag?.base || describe(s);
    const recs = this.afferent.describeFor(info.receptors || []);
    this._liveNodes = s.nodes;

    /* The deep read-out is licensed separately from the anatomy. Static tissue
       descriptors stay open — they are the educational payload — while the live
       viscoelastic parameters, per-class bandwidth and latency, and bound dataset
       values belong to the advanced instrument. */
    const deep = entitlements.can('telemetry.advanced');
    const lockRow = (label) =>
      `<dt>${label}</dt><dd class="dd-locked" data-cap="telemetry.advanced"><i class="ic-lock"></i></dd>`;

    const extra = deep
      ? (bag?.fields || [])
          .map(
            (f) =>
              `<dt>${f.label}</dt><dd>${typeof f.value === 'number' ? f.value.toLocaleString() : f.value}${
                f.unit ? ` <small style="color:var(--ink-3)">${f.unit}</small>` : ''
              }<span class="prov">${f.source}</span></dd>`
          )
          .join('')
      : (bag?.fields || []).map((f) => lockRow(f.label)).join('');

    host.innerHTML = `
      <div class="insp-head">
        <div class="insp-kicker"><i style="color:${layer?.color || '#8ea8bd'}"></i>${layer?.name || s.layer}${s.group ? ` · ${s.group}` : ''}</div>
        <h3 class="insp-title">${s.name}</h3>
        ${s.latin ? `<div class="insp-latin">${s.latin}</div>` : ''}
        <div class="insp-id" id="insp-id" title="Permanent anatomical ID — the key every dataset, annotation and saved project uses. Click to copy.">
          <span>${s.id || '—'}</span><small>copy</small>
        </div>
      </div>
      ${info.note ? `<p class="insp-desc">${info.note}</p>` : ''}

      <div class="insp-sub">Mechanical state</div>
      <dl class="kv">
        <dt>Tension vs. rest</dt><dd id="live-load">—</dd>
        <div class="bar"><i id="live-load-bar"></i></div>
        ${
          deep
            ? `<dt>Strain rate</dt><dd id="live-rate">—</dd>
        <dt>Displacement</dt><dd id="live-disp">—</dd>
        <dt>Local stiffening</dt><dd id="live-stiff">—</dd>
        <dt>Local viscosity</dt><dd id="live-visc">—</dd>
        <dt>Interstitial pressure</dt><dd id="live-press">—</dd>`
            : `${lockRow('Strain rate')}${lockRow('Displacement')}${lockRow('Local stiffening')}${lockRow(
                'Local viscosity'
              )}${lockRow('Interstitial pressure')}`
        }
      </dl>

      <div class="insp-sub">Tissue properties</div>
      <dl class="kv">
        <dt>Composition</dt><dd>${info.tissue}</dd>
        <dt>Elastic modulus</dt><dd>${info.modulus}</dd>
        <dt>Viscoelasticity</dt><dd>${info.viscoelasticity || info.tau}</dd>
        <dt>Preferred stimulus</dt><dd>${info.preferredStimulus || info.stimulus}</dd>
        <dt>Region</dt><dd>${(s.regionCode || '—').toLowerCase().replace(/_/g, ' ')}</dd>
        <dt>Network nodes</dt><dd>${s.nodes.length}</dd>
      </dl>
      <p class="insp-desc">${info.role}</p>

      ${extra ? `<div class="insp-sub">Bound data</div><dl class="kv">${extra}</dl>` : ''}

      <div class="insp-sub">Sensory population</div>
      <div id="insp-recs"></div>

      <div class="insp-sub">Afferent destination</div>
      <dl class="kv">
        <dt>${info.pathwayName || info.pathway?.name}</dt><dd id="live-pw">—</dd>
        <dt>Carries</dt><dd style="text-align:left;font-family:var(--sans);font-size:10.5px">${
          info.pathwayCarries || info.pathway?.carries
        }</dd>
      </dl>

      <div class="insp-actions">
        <button class="btn btn-sm" id="insp-fly">Fly to</button>
        <button class="btn btn-sm" id="insp-solo">Isolate</button>
        <button class="btn btn-sm" id="insp-hide">Hide</button>
        <button class="btn btn-sm" id="insp-apply">Apply load</button>
      </div>`;

    const idBox = el('#insp-id', host);
    idBox?.addEventListener('click', () => {
      navigator.clipboard?.writeText(s.id || '').then(
        () => this.actions.toast?.(`Copied <b>${s.id}</b>`),
        () => {}
      );
    });

    // any locked read-out row opens the plan, so the value is discoverable
    for (const dd of host.querySelectorAll('.dd-locked')) {
      const cap = dd.dataset.cap;
      dd.title = `${CAPABILITIES[cap]?.name || 'Professional'} — ${CAPABILITIES[cap]?.blurb || ''}`;
      dd.addEventListener('click', () => this.premium?.open(`${CAPABILITIES[cap]?.name} is a Professional feature.`));
    }

    const rh = el('#insp-recs', host);
    if (!recs.length) {
      rh.innerHTML = `<p class="pnote">No discrete endings modelled in this structure.</p>`;
    } else {
      this._recRows = [];
      for (const r of recs) {
        const row = make('dl', 'kv');
        row.innerHTML = `
          <dt style="color:${r.color}">${r.short}</dt>
          <dd><b class="rr-rate">—</b> Hz</dd>
          <div class="bar"><i class="rr-bar" style="background:${r.color}"></i></div>
          <dt style="font-size:9.5px;opacity:.8">${r.adapt}</dt>
          <dd style="font-size:9.5px;opacity:.8">${r.band} · ${r.fiber} (${r.group})</dd>
          ${
            deep
              ? `<dt style="font-size:9.5px;opacity:.8">fidelity / latency</dt>
          <dd style="font-size:9.5px" class="rr-fid">—</dd>`
              : `<dt style="font-size:9.5px;opacity:.8">fidelity / latency</dt>
          <dd class="dd-locked" data-cap="telemetry.advanced"><i class="ic-lock"></i></dd>`
          }`;
        row.title = `${r.name} — ${r.detects}\nConduction ${r.cv} → ${r.target}`;
        rh.appendChild(row);
        this._recRows.push({ id: r.id, rate: row.querySelector('.rr-rate'), bar: row.querySelector('.rr-bar'), fid: row.querySelector('.rr-fid') });
      }
    }

    el('#insp-fly', host).addEventListener('click', () => this.actions.flyTo?.(s.key));
    el('#insp-solo', host).addEventListener('click', () => this.store.toggleSolo(s.layer));
    el('#insp-hide', host).addEventListener('click', () => this.actions.hideSelection?.());
    el('#insp-apply', host).addEventListener('click', () => this.actions.apply?.());
    this._inspKeys = keys.join('|');
    this._pathwayId = info.pathway.id;
  }

  /** Per-frame refresh of just the numbers inside the inspector. */
  tick() {
    if (!this._liveNodes) return;
    const s = this.solver;
    const nodes = this._liveNodes;
    if (!nodes.length) return;
    const dev = s.meanOf(s.dev, nodes);
    const rate = s.meanOf(s.strainRate, nodes);
    const stiff = s.meanOf(s.stiffness, nodes);
    const visc = s.meanOf(s.viscosity, nodes);
    const press = s.meanOf(s.pressure, nodes);

    const set = (id, text) => {
      const n = document.getElementById(id);
      if (n) n.textContent = text;
    };
    // expressed against this tissue's own resting tension, which is the only
    // reference that means anything locally
    set('live-load', Math.abs(dev) < 0.02 ? 'at rest' : `${dev > 0 ? '+' : ''}${(dev * 100).toFixed(0)} % vs rest`);
    set('live-rate', `${rate >= 0 ? '+' : ''}${rate.toFixed(2)} /s`);
    {
      let d = 0;
      for (const i of nodes) {
        const dx = s.pos[i * 3] - s.home[i * 3];
        const dy = s.pos[i * 3 + 1] - s.home[i * 3 + 1];
        const dz = s.pos[i * 3 + 2] - s.home[i * 3 + 2];
        d += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      set('live-disp', `${((d / nodes.length) * 1000).toFixed(2)} mm`);
    }
    set('live-stiff', stiff > 0.002 ? `+${(stiff * 100).toFixed(0)} %` : 'baseline');
    set('live-visc', visc > 0.002 ? `+${(visc * 100).toFixed(0)} %` : 'baseline');
    set('live-press', press > 0.002 ? `${(press * 100).toFixed(0)} %` : 'baseline');

    const bar = document.getElementById('live-load-bar');
    if (bar) {
      // centre of the bar is rest; it fills right when loaded, left when slack
      const pct = clamp((dev + 1) / 2.6, 0, 1) * 100;
      bar.style.width = `${pct}%`;
      bar.style.background = dev > 0.7 ? '#ff6f52' : dev > 0.2 ? '#f0b429' : dev < -0.2 ? '#5b83d6' : '#4fd6e0';
    }

    if (this._recRows) {
      for (const r of this._recRows) {
        const p = this.afferent.pops.get(r.id);
        if (!p) continue;
        r.rate.textContent = p.rate.toFixed(0);
        r.bar.style.width = `${clamp(p.rateNorm, 0, 1) * 100}%`;
        // absent when the advanced read-out is not licensed
        if (r.fid) {
          r.fid.textContent = `${(p.fidelity * 100).toFixed(0)} % · ${p.latency.toFixed(0)} ms`;
          r.fid.style.color = p.fidelity < 0.6 ? '#ff6f52' : p.fidelity < 0.82 ? '#f0b429' : '#4fe0a0';
        }
      }
    }

    if (this._pathwayId) {
      const pw = this.afferent.pathways.get(this._pathwayId);
      const n = document.getElementById('live-pw');
      if (pw && n) n.textContent = `${pw.rate.toFixed(0)} Hz · ${(pw.fidelity * 100).toFixed(0)} %`;
    }
  }

  /* ============================================================
     Active interventions
     ============================================================ */

  renderRestrictions() {
    const host = el('#restriction-list');
    host.innerHTML = '';
    if (!this.store.restrictions.length) {
      host.innerHTML = `<p class="pnote">No load applied. The network is at its resting pre-tension.</p>`;
      return;
    }
    for (const r of this.store.restrictions) {
      const item = make(
        'div',
        'rest-item',
        `<i></i><span>${r.label}</span><em>${Math.round(r.magnitude * 100)}%</em><button title="Release">×</button>`
      );
      item.title = `${r.kindName} · ${r.nodeCount} network nodes · radius ${(r.radius * 100).toFixed(1)} cm`;
      item.querySelector('button').addEventListener('click', () => this.actions.releaseOne?.(r.id));
      host.appendChild(item);
    }
  }
}
