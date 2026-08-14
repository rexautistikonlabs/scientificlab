/* ============================================================
   Entitlement UI — tier badge, plan dialog, locked states.

   The locked states here are presentation only. Every capability is already
   enforced in the store, the scale manager and the tools; if this file were
   deleted the gate would still hold. What it adds is the thing a freemium
   product actually needs: making the locked capability legible and desirable
   at the moment the user reaches for it, rather than hiding it.
   ============================================================ */

import { el, make } from '../core/util.js';
import { entitlements, CAPABILITIES, TIERS, FREE_LAYERS, FREE_MAX_TIER } from '../platform/entitlements.js';
import { SCALES, LAYERS } from '../core/store.js';

const LOCK_ICON = '<i class="ic-lock"></i>';

/** Free-tier feature list for the plan dialog. */
const FREE_POINTS = [
  ['Whole-body and region scale', 'Orbit, zoom to the region tier, and the living physiology running throughout.'],
  ['Major systems', 'Bones, major muscle groups, organs and the skin envelope.'],
  ['Single selection', 'Click any visible structure for its anatomy, tissue properties and sensory population.'],
  [
    'Basic live telemetry',
    'Network load, global tension, signal integrity and fidelity, breath excursion and fluid transport — read from the same solve the Professional tier uses.',
  ],
];

const PRO_POINTS = [
  ['Continuous macro → receptor traversal', 'All five scale tiers, with the progressive cutaway and receptor micro-anatomy.'],
  ['Every structure, every layer', 'Superficial, deep and visceral fascia, myofascial lines, individual muscles, nerves, vessels, lymph and receptor fields.'],
  ['Unlimited multi-select', 'Any combination across any systems, with isolate, hide and per-layer opacity.'],
  ['Mechanical intervention', 'Tension, compression, restriction and shear, with global force redistribution.'],
  ['Tension mapping and signal streams', 'Colour by live tension, travelling action potentials, tension-network overlay.'],
  [
    'Advanced telemetry',
    'Per-receptor bandwidth and latency, live viscoelastic parameters, left/right comparison and the afferent trace.',
  ],
  ['Measurement and annotation', 'Distance, tension and signal probes; notes pinned to anatomical IDs.'],
  ['Research overlays', 'Any ID-keyed dataset painted onto the model, with provenance.'],
  ['Projects and export', 'Save, reload and export scenes; the same IDs form the API surface.'],
];

export class PremiumUI {
  constructor({ hud, onTierChange }) {
    this.hud = hud;
    this.onTierChange = onTierChange;

    this.dialog = el('#upgrade');
    this.badge = el('#tier-badge');
    this.tierName = el('#tier-name');
    this.tierBtn = el('#btn-tier');
    this.watermark = el('#watermark');
    this.msg = el('#licence-msg');
    this._msgDefault = this.msg.innerHTML;

    this.tierBtn.addEventListener('click', () => this.open());
    el('#upgrade-x').addEventListener('click', () => this.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.close();
    });

    el('#btn-redeem').addEventListener('click', () => this._redeem());
    el('#licence-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._redeem();
      e.stopPropagation();
    });
    el('#btn-downgrade').addEventListener('click', () => {
      entitlements.reset();
      this.close();
    });

    this._buildPlans();
    entitlements.on('tier', () => {
      this.syncTier();
      this.onTierChange?.();
    });

    /* One prompt per capability per session. A freemium product that interrupts
       on every blocked click trains users to ignore it. */
    this._prompted = new Set();
    entitlements.on('blocked', ({ cap, info }) => {
      if (this._prompted.has(cap)) return;
      this._prompted.add(cap);
      this.hud.toast(
        `<b>${info?.name || cap}</b> is a Professional feature — click <b>${entitlements.tierInfo.badge}</b> in the top bar`,
        4200
      );
    });

    this.syncTier();
  }

  _buildPlans() {
    const fill = (host, points) => {
      host.innerHTML = '';
      for (const [title, blurb] of points) host.appendChild(make('li', '', `${title}<em>${blurb}</em>`));
    };
    fill(el('#plan-free-list'), FREE_POINTS);
    fill(el('#plan-pro-list'), PRO_POINTS);
  }

  _redeem() {
    const input = el('#licence-key');
    const res = entitlements.redeem(input.value);
    if (res.ok) {
      input.value = '';
      this.msg.innerHTML = `<b style="color:var(--jade)">Professional activated.</b> Every scale, structure and tool is now available.`;
      this.hud.toast('<b>Professional activated</b> — all scales, structures and tools unlocked', 4000);
      setTimeout(() => this.close(), 900);
    } else {
      this.msg.innerHTML = `<b style="color:var(--coral)">${res.reason}</b> Try <code>DEMO</code>.`;
    }
  }

  open(reason = null) {
    const t = entitlements.tierInfo;
    el('#upgrade-lead').textContent = reason
      ? `${reason} Professional unlocks the full instrument.`
      : `You are on ${t.name}. ${t.blurb}`;

    el('#plan-free').classList.toggle('plan-current', !entitlements.isPremium);
    el('#plan-premium').classList.toggle('plan-current', entitlements.isPremium);

    // list what this user actually tried to use — far more persuasive than a
    // generic feature grid
    const reached = entitlements.lockedCapabilities().filter((c) => c.attempts > 0);
    const box = el('#upgrade-reached');
    box.hidden = reached.length === 0;
    if (reached.length) {
      const list = el('#upgrade-reached-list');
      list.innerHTML = '';
      for (const c of reached.slice(0, 6)) {
        list.appendChild(
          make('li', '', `<b>${c.name}</b>${c.blurb ? ` — ${c.blurb}` : ''} <em style="color:var(--ink-3)">×${c.attempts}</em>`)
        );
      }
    }
    this.msg.innerHTML = this._msgDefault;
    this.dialog.hidden = false;
  }

  close() {
    this.dialog.hidden = true;
  }

  toggle() {
    if (this.dialog.hidden) this.open();
    else this.close();
  }

  syncTier() {
    const t = entitlements.tierInfo;
    this.badge.textContent = t.badge;
    this.badge.classList.toggle('tier-pro', entitlements.isPremium);
    this.tierName.textContent = t.name;
    this.tierBtn.classList.toggle('is-pro', entitlements.isPremium);
    this.tierBtn.title = entitlements.isPremium
      ? 'Professional — every scale, structure and tool'
      : 'Explorer (free) — click to see what Professional adds';
    this.watermark.hidden = entitlements.isPremium;
  }

  /* ============================================================
     Locked-state decoration
     ============================================================ */

  /**
   * Veil any panel section carrying `data-cap` whose capability is not granted.
   * Re-runnable: called again whenever the tier changes.
   */
  decorateSections() {
    for (const section of document.querySelectorAll('.pgroup[data-cap]')) {
      const cap = section.dataset.cap;
      const info = CAPABILITIES[cap];
      const locked = !entitlements.can(cap);
      section.classList.toggle('locked', locked);
      const existing = section.querySelector('.lock-veil');
      if (!locked) {
        existing?.remove();
        continue;
      }
      if (existing) continue;
      const veil = make(
        'div',
        'lock-veil',
        `<b>${LOCK_ICON}${info?.name || 'Professional feature'}</b><span>${info?.blurb || ''}</span>`
      );
      veil.title = 'Click to see the Professional plan';
      veil.addEventListener('click', () => this.open(`${info?.name || 'That'} is a Professional feature.`));
      section.appendChild(veil);
    }
  }

  /** Mark scale-rail buttons above the licensed ceiling. */
  decorateScaleRail(buttons) {
    const max = entitlements.maxScaleTier();
    buttons.forEach((b, i) => {
      const locked = i > max;
      b.classList.toggle('locked', locked);
      if (locked) {
        b.title = `${SCALES[i].name} scale — Professional. ${CAPABILITIES['scale.deep'].blurb}`;
      } else {
        b.title = `Traverse to the ${SCALES[i].name.toLowerCase()} scale (${SCALES[i].note})`;
      }
    });
  }

  /** Mark layer rows the licence does not cover. */
  decorateLayerRows(rows) {
    for (const [id, r] of rows) {
      const locked = !entitlements.canSeeLayer(id);
      r.row.classList.toggle('locked', locked);
      if (locked && !r.row.querySelector('.lr-lock')) {
        const lock = make('span', 'lr-lock', LOCK_ICON);
        r.row.querySelector('.lr-tools')?.before(lock);
      } else if (!locked) {
        r.row.querySelector('.lr-lock')?.remove();
      }
      if (locked) {
        const def = LAYERS.find((l) => l.id === id);
        r.row.title = `${def?.name || id} — Professional. ${CAPABILITIES['layers.advanced'].blurb}`;
      }
    }
  }

  /** Mark chips (receptor classes, overlays, parameter sets) by capability. */
  decorateChips(chips, cap) {
    const locked = !entitlements.can(cap);
    for (const chip of chips) chip.classList.toggle('locked', locked);
  }

  static get freeLayers() {
    return FREE_LAYERS;
  }
  static get freeMaxTier() {
    return FREE_MAX_TIER;
  }
  static get tiers() {
    return TIERS;
  }
}
