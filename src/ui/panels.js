/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

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
import { MICRO_ROIS } from '../sim/spindle.js';
import { PROTOCOLS } from '../sim/spindle_extended.js';
import { runExperiment, PERTURBATIONS } from '../sim/experiment.js';
import { LAYERS as MODEL_LAYERS, OUTPUTS, outputsIn, EXPERIMENT_CAPTION, LAYER_NOTE } from '../platform/layers.js';
import { MICRO_PARAMS, setParam } from '../data/micro/literature_params.js';

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
    this._buildMicroControls();
    this._buildLayersNote();
    this._buildExperimentControls();
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

  /* ============================================================
     Microscope mode
     ============================================================ */

  _buildMicroControls() {
    const host = el('#micro-controls');
    if (!host) return;
    host.innerHTML = '';
    const m = this.store.micro;

    this._microPin = this._check(host, {
      label: 'Pin Microscope mode',
      value: m.pinned,
      onChange: (v) => this.store.setMicroPinned(v),
      title: 'Hold the mode on regardless of camera distance (⇧M). Otherwise it engages past the tissue scale.',
      cap: 'scale.deep',
    });

    this._check(host, {
      label: 'Steady the body',
      value: m.steady,
      onChange: (v) => this.store.setMicro('steady', v),
      title:
        'Damp the drawn gross-body motion so a millimetre-scale subject holds still. ' +
        'Display only — the simulation and every number in the read-out are unaffected.',
      cap: 'scale.deep',
    });

    this._segmented(host, {
      label: 'Region',
      options: MICRO_ROIS.map((r) => ({ id: r.id, name: r.label.split(' · ')[0] })),
      value: m.roi,
      onPick: (v) => this.store.setMicro('roi', v),
      title: 'Which muscle the spindle is placed in. Changing it rebinds to that network element.',
      cap: 'scale.deep',
    });

    /* ---- drive model ----
       Basic is the default and stays it: the length-and-velocity law this ROI
       was verified against, and the one every earlier acceptance figure refers
       to. Extended is opt-in and says so. */
    this._segmented(host, {
      label: 'Drive model',
      options: [
        { id: 'basic', name: 'Basic' },
        { id: 'extended', name: 'Extended' },
      ],
      value: m.model,
      onPick: (v) => this.store.setMicro('model', v),
      title:
        'Basic (legacy): firing from length and velocity — the product default.\n' +
        'Extended: firing from an intrafusal tension proxy and its rate of change, with stretch history and ' +
        'optional fusimotor drive. Simplified and educational, inspired by Blum et al. 2020 (doi:10.7554/eLife.55177). ' +
        'Not a reproduction of that work and not validated against it.',
      cap: 'scale.deep',
    });

    /* ---- fusimotor ----
       Defaults at zero, deliberately: a spindle with no fusimotor drive is the
       honest starting point, and every earlier figure was measured there. */
    this._microGammaStatic = this._slider(host, {
      label: 'Static γ-like drive',
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(m.gammaStatic * 100),
      format: (v) => (v === 0 ? 'off' : `${v} %`),
      onInput: (v) => this.store.setMicro('gammaStatic', v / 100),
      title:
        'Schematic static fusimotor drive. Raises baseline discharge and sustained-tension sensitivity through the ' +
        'chain-like channel. Extended model only.',
      cap: 'scale.deep',
    });

    this._microGammaDynamic = this._slider(host, {
      label: 'Dynamic γ-like drive',
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(m.gammaDynamic * 100),
      format: (v) => (v === 0 ? 'off' : `${v} %`),
      onInput: (v) => this.store.setMicro('gammaDynamic', v / 100),
      title:
        'Schematic dynamic fusimotor drive. Stiffens the short-range element and raises yank sensitivity through ' +
        'the bag-like channel, so the response to how fast a stretch arrives grows. Extended model only.',
      cap: 'scale.deep',
    });

    /* ---- scenarios ----
       A protocol imposes a length trajectory on the ending, so a demonstration
       is exactly what it says it is. The living body is never exactly anything
       twice, which is fine for watching and useless for measuring. */
    this._segmented(host, {
      label: 'Scenario',
      options: [{ id: 'live', name: 'Live body' }, ...Object.values(PROTOCOLS).map((p) => ({ id: p.id, name: p.name.split(' (')[0] }))],
      value: m.scenario || 'live',
      onPick: (v) => this.store.setMicro('scenario', v === 'live' ? null : v),
      title:
        'Live body reads the solved element length. The others impose a ramp–hold–release trajectory so the ' +
        'response can be measured rather than watched. Amplitudes are educational, not taken from any paper.',
      cap: 'scale.deep',
    });

    /* Two parameters are exposed for tuning because they are the two the
       acceptance checks turn on: move either and the pulses visibly arrive
       sooner or later. Both are clamped to their published range by the
       parameter table itself, so the control cannot leave the literature. */
    for (const id of ['iaConductionVelocity', 'iaPathLength']) {
      const p = MICRO_PARAMS[id];
      if (!p) continue;
      const toSlider = (v) => Math.round(((v - p.min) / (p.max - p.min)) * 1000);
      const fromSlider = (v) => p.min + (v / 1000) * (p.max - p.min);
      this._slider(host, {
        label: p.symbol === 'ℓ' ? 'Path length' : 'Conduction velocity',
        min: 0,
        max: 1000,
        step: 1,
        value: toSlider(p.value),
        format: (v) => {
          const x = fromSlider(v);
          return p.unit === 'm' ? `${(x * 100).toFixed(1)} cm` : `${x.toFixed(0)} ${p.unit}`;
        },
        onInput: (v) => setParam(id, fromSlider(v)),
        title: `${p.notes}\n\nPublished range ${p.min}–${p.max} ${p.unit} (${p.species}).`,
        cap: 'scale.deep',
      });
    }

    const note = make('p', 'pnote');
    note.innerHTML =
      'Parameters are read from the literature table and clamped to their published ranges. ' +
      '<b>Citations are unverified placeholders</b> — a human must check each against its primary source. ' +
      'The Extended model is a simplified educational sketch inspired by ' +
      '<a href="https://doi.org/10.7554/eLife.55177" target="_blank" rel="noopener noreferrer">Blum et al. 2020</a>, ' +
      'not a reproduction of it.';
    host.appendChild(note);
  }


  /* ============================================================
     Model layers, and the controlled experiment
     ============================================================ */

  /** The always-reachable explanation of what kind of claim each number is. */
  _buildLayersNote() {
    const host = el('#layers-body');
    if (!host) return;
    host.innerHTML =
      Object.values(MODEL_LAYERS)
        .map(
          (L) => `<div class="layer-row layer-${L.id.toLowerCase()}">
            <b><span class="layer-tag">${L.short}</span> ${L.name}</b>
            <p>${L.blurb}</p>
            <em>${outputsIn(L.id).slice(0, 7).map((o) => o.name).join(' · ')}</em>
          </div>`
        )
        .join('') + `<p class="layer-foot">${LAYER_NOTE}</p>`;
  }

  _buildExperimentControls() {
    const host = el('#experiment-controls');
    if (!host) return;
    host.innerHTML = '';
    this._exp = { protocol: 'passiveRHR', perturbation: 'restriction', magnitude: 0.6 };

    this._segmented(host, {
      label: 'Protocol',
      options: Object.values(PROTOCOLS)
        .filter((p) => p.expected) // the literature-shaped presets, which carry an expected pattern
        .map((p) => ({ id: p.id, name: p.name.split(' (')[0].replace('Passive ramp–hold–release', 'Passive RHR') })),
      value: this._exp.protocol,
      onPick: (v) => {
        this._exp.protocol = v;
        this._syncExpNote();
      },
      title: 'The shape of the imposed stretch. "Literature protocol" means the shape only — no scored comparison against any published series exists in this product.',
      cap: 'scale.deep',
    });

    this._segmented(host, {
      label: 'Perturbation',
      options: Object.values(PERTURBATIONS)
        .filter((p) => p.id !== 'none')
        .map((p) => ({ id: p.id, name: p.name })),
      value: this._exp.perturbation,
      onPick: (v) => {
        this._exp.perturbation = v;
        this._syncExpNote();
      },
      title: 'The mechanical change applied in the second run. Modelled as reduced transmission plus added lag at the ending — this product\'s own assumption, documented in METRICS.md.',
      cap: 'scale.deep',
    });

    this._slider(host, {
      label: 'Magnitude',
      min: 0,
      max: 100,
      step: 5,
      value: Math.round(this._exp.magnitude * 100),
      format: (v) => `${v} %`,
      onInput: (v) => {
        this._exp.magnitude = v / 100;
      },
      title: 'How strong the perturbation is, on the same scale the intervention tool uses.',
      cap: 'scale.deep',
    });

    const row = make('div', 'ctrl exp-run');
    row.innerHTML = '<button class="btn btn-sm btn-primary" id="btn-run-exp">Run experiment</button>';
    host.appendChild(row);
    const btn = row.querySelector('#btn-run-exp');
    btn.addEventListener('click', () => this.runExperiment());
    /* Registered with the same list every other gated control uses, so it
       re-enables on a tier change instead of staying dead until reload. */
    this._gatedControls.push({ cap: 'scale.deep', input: btn, row, label: 'Computational experiment' });
    this.syncGatedControls();

    this._expNote = make('p', 'pnote exp-note');
    host.appendChild(this._expNote);
    this._syncExpNote();
  }

  _syncExpNote() {
    if (!this._expNote) return;
    const spec = PROTOCOLS[this._exp.protocol];
    const model = this.store.micro.model;
    const unsafe = spec?.safeFor && !spec.safeFor.includes(model);
    this._expNote.innerHTML =
      `<b>${spec?.name ?? '—'}</b> — ${spec?.blurb ?? ''}` +
      (spec?.expected ? `<br><em>Expected pattern from the literature (direction only): ${spec.expected}</em>` : '') +
      (unsafe
        ? `<br><span class="exp-warn">⚠ This preset is sized for the ${spec.safeFor.join('/')} drive. ` +
          `${spec.warn ?? 'The current drive may saturate.'}</span>`
        : '');
  }

  /**
   * Run baseline and perturbed conditions and render the comparison.
   *
   * Runs offline at full temporal resolution rather than on the live unit: the
   * comparison has to hold everything except the perturbation identical, and a
   * live body under a breath cycle does not.
   */
  runExperiment() {
    const spec = PROTOCOLS[this._exp.protocol];
    if (!spec) return;
    const result = runExperiment(spec, {
      model: this.store.micro.model,
      perturbation: this._exp.perturbation,
      magnitude: this._exp.magnitude,
      gamma: { static: this.store.micro.gammaStatic, dynamic: this.store.micro.gammaDynamic },
    });
    this.lastExperiment = result;
    this._renderExperiment(result);
    return result;
  }

  _renderExperiment(r) {
    const host = el('#experiment-results');
    const cap = el('#experiment-caption');
    if (!host) return;

    const rows = [
      ['maxStrainMm', 'A'],
      ['peakRateHz', 'B'],
      ['earlyBurstHz', 'B'],
      ['plateauHz', 'B'],
      ['dynamicIndex', 'B'],
      ['spikes', 'B'],
    ];
    const label = {
      maxStrainMm: 'ΔL delivered (mm)',
      peakRateHz: 'Peak rate (Hz)',
      earlyBurstHz: 'Early burst (Hz)',
      plateauHz: 'Plateau (Hz)',
      dynamicIndex: 'Dynamic index',
      spikes: 'Spikes',
    };

    const warn = r.warnings.length
      ? `<div class="exp-warnbox">${r.warnings.map((w) => `<p>⚠ ${w}</p>`).join('')}</div>`
      : '';

    host.innerHTML = `
      <div class="exp-head">
        <span>${r.protocol.name}</span>
        <em>${r.model} drive · ${r.perturbation.name} ${Math.round(r.perturbation.magnitude * 100)} %</em>
      </div>
      <div class="exp-terms">
        ${(r.perturbation.terms.transmission * 100).toFixed(0)} % of the commanded excursion reaches the ending ·
        lag τ ${(r.perturbation.terms.tau * 1000).toFixed(1)} ms
      </div>
      ${warn}
      <table class="exp-table">
        <thead><tr><th></th><th>baseline</th><th>perturbed</th><th>Δ</th></tr></thead>
        <tbody>
          ${rows
            .map(([k, layer]) => {
              const d = r.delta[k];
              if (!d) return '';
              const pct = d.pct === null ? `${d.abs > 0 ? '+' : ''}${d.abs}` : `${d.pct > 0 ? '+' : ''}${d.pct} %`;
              const cls = d.abs === 0 ? '' : d.abs > 0 ? 'up' : 'down';
              return `<tr>
                <th><span class="layer-tag layer-${layer.toLowerCase()}" title="${OUTPUTS[
                  k === 'maxStrainMm' ? 'deltaLength' : k === 'spikes' ? 'spikes' : k === 'dynamicIndex' ? 'dynamicIndex' : 'rate'
                ]?.definition ?? ''}">${layer}</span>${label[k]}</th>
                <td>${d.from}</td><td>${d.to}</td><td class="${cls}">${pct}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
    host.hidden = false;
    if (cap) {
      cap.textContent = EXPERIMENT_CAPTION;
      cap.hidden = false;
    }
  }

  /** Reflect the store after a shortcut toggled the mode. */
  syncMicroControls() {
    this._syncExpNote();
    if (this._microPin) this._microPin.checked = this.store.micro.pinned;
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
