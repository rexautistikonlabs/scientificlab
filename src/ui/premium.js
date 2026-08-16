/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Account and entitlement UI — tier badge, account dialog, locked states.

   The locked states here are presentation only. Every capability is already
   enforced in the store, the scale manager and the tools; if this file were
   deleted the gate would still hold. What it adds is the thing a freemium
   product actually needs: making the locked capability legible and desirable
   at the moment the user reaches for it, rather than hiding it.

   The account flow is the same shape: it collects a session and a
   subscription and hands them to `auth`, which resolves an entitlement
   claim. This file never decides what anyone is entitled to.
   ============================================================ */

import { el, make } from '../core/util.js';
import { entitlements, CAPABILITIES, TIERS, FREE_LAYERS, FREE_MAX_TIER } from '../platform/entitlements.js';
import { auth, PLANS, PROVIDERS } from '../platform/auth.js';
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
      auth.signOut();
      entitlements.reset();
      this.close();
    });

    this._buildPlans();
    this._buildAccount();
    entitlements.on('tier', () => {
      this.syncTier();
      this.onTierChange?.();
    });
    entitlements.on('expired', () => {
      this.hud.toast('<b>Subscription period ended</b> — back on Explorer. Renew from the account panel.', 6000);
    });
    auth.on('session', ({ reason }) => {
      this.syncAccount();
      if (reason === 'signIn') this.hud.toast(`Signed in as <b>${auth.session.email}</b>`, 3200);
      if (reason === 'signOut') this.hud.toast('Signed out', 2400);
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
    el('#plan-free-price').textContent = PLANS.explorer.price;
    el('#plan-pro-price').textContent = `${PLANS.professional.price} ${PLANS.professional.cadence}`;
  }

  /* ============================================================
     Account
     ============================================================ */

  _buildAccount() {
    this.signinBox = el('#signin');
    this.signinMsg = el('#signin-msg');
    const emailInput = el('#signin-email');

    const submit = (provider = 'email') => {
      const res = auth.signIn({ email: emailInput.value, provider });
      if (res.ok) {
        emailInput.value = '';
        this.signinMsg.textContent = '';
      } else {
        this.signinMsg.innerHTML = `<b style="color:var(--coral)">${res.reason}</b>`;
      }
    };

    el('#btn-signin').addEventListener('click', () => submit('email'));
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit('email');
      e.stopPropagation();
    });

    /* Provider buttons are mocked to the same local sign-in. They exist because
       the shape of the flow is part of what is being scaffolded: each one becomes
       a redirect or a magic-link request, and all three still finish at a claim. */
    const host = el('#signin-providers');
    host.innerHTML = '';
    for (const p of PROVIDERS) {
      if (p.id === 'email') continue;
      const b = make('button', 'btn btn-sm', `Continue with ${p.name}`);
      b.title = `${p.note} Mocked in this build — enter an address above and it signs in locally.`;
      b.addEventListener('click', () => {
        if (!el('#signin-email').value.trim()) {
          this.signinMsg.innerHTML = `<b>${p.name} sign-in is mocked here</b> — enter an address above to continue.`;
          return;
        }
        submit(p.id);
      });
      host.appendChild(b);
    }

    this.syncAccount();
  }

  /** Re-render the account strip, its actions and the plan calls-to-action. */
  syncAccount() {
    const d = auth.describe();
    el('#acct-label').textContent = d.label;
    el('#acct-detail').textContent = d.detail;
    el('#acct').className = `acct acct-${d.tone}`;
    el('#acct-avatar').textContent = auth.signedIn ? (auth.session.name || auth.session.email).charAt(0).toUpperCase() : '·';
    this.signinBox.hidden = auth.signedIn;

    const actions = el('#acct-actions');
    actions.innerHTML = '';
    const add = (label, cls, fn, title) => {
      const b = make('button', `btn btn-sm${cls ? ` ${cls}` : ''}`, label);
      if (title) b.title = title;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };

    if (!auth.signedIn) {
      add('Sign in', 'btn-primary', () => el('#signin-email').focus());
    } else {
      const s = auth.session;
      if (s.status === 'active') {
        add('Cancel subscription', '', () => {
          const r = auth.cancel();
          this.syncAccount();
          if (r.ok) {
            this.hud.toast(
              `Cancelled — Professional stays active until <b>${new Date(r.until).toLocaleDateString()}</b>`,
              5000
            );
          }
        }, 'Stays active until the end of the paid period, as a real subscription does');
      } else {
        add('Subscribe', 'btn-primary', () => this._subscribe('professional'));
      }
      add('Sign out', '', () => auth.signOut());
    }

    /* plan calls-to-action */
    const freeCta = el('#plan-free-cta');
    const proCta = el('#plan-pro-cta');
    freeCta.innerHTML = '';
    proCta.innerHTML = '';
    if (entitlements.isPremium) {
      proCta.appendChild(make('span', 'plan-current-tag', 'Your plan'));
    } else {
      const b = make('button', 'btn btn-primary', auth.signedIn ? 'Subscribe' : 'Sign in to subscribe');
      b.addEventListener('click', () => {
        if (!auth.signedIn) {
          el('#signin-email').focus();
          return;
        }
        this._subscribe('professional');
      });
      proCta.appendChild(b);
      freeCta.appendChild(make('span', 'plan-current-tag', 'Your plan'));
    }
  }

  _subscribe(planId) {
    const res = auth.subscribe(planId);
    this.syncAccount();
    if (res.ok) {
      this.msg.innerHTML = `<b style="color:var(--jade)">${res.plan.name} active.</b> Every scale, structure and tool is now available. No payment was taken — this is a mock checkout.`;
      this.hud.toast('<b>Professional activated</b> — all scales, structures and tools unlocked', 4000);
      setTimeout(() => this.close(), 1100);
    } else {
      this.msg.innerHTML = `<b style="color:var(--coral)">${res.reason}</b>`;
    }
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

    this.syncAccount();
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
    // the top-bar button doubles as the account button, so it shows who is signed
    // in rather than repeating the tier name the badge beside it already carries
    this.tierName.textContent = auth.signedIn ? auth.session.name : t.name;
    this.tierBtn.classList.toggle('is-pro', entitlements.isPremium);
    this.tierBtn.title = entitlements.isPremium
      ? `Professional${auth.signedIn ? ` · ${auth.session.email}` : ''} — account and plan`
      : 'Explorer (free) — sign in, subscribe, or see what Professional adds';
    this.watermark.hidden = entitlements.isPremium;
    if (this.signinBox) this.syncAccount();
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
