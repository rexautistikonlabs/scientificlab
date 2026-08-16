/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   The non-diagnostic gate.

   This is the one modal in the product that is genuinely mandatory.
   Everything else here can be dismissed, skipped, or remembered away;
   this cannot, because what it says is the difference between a
   teaching instrument and a claim about somebody's body.

   Consequences of that, all deliberate:

     • No close button, no backdrop click, no Escape. The only exit is
       the affirmative button, and the button only enables once the
       checkbox is ticked.
     • ?skip does not bypass it. The query string skips the start
       screen because that screen is marketing; a gate that a URL
       parameter defeats is not a gate.
     • Focus is trapped inside the card while it is open, so a
       keyboard user cannot tab into the application behind it.
     • The acknowledgment is versioned. Editing the text without
       bumping DISCLAIMER_VERSION would leave every existing user
       having agreed to something they never read.

   Storage failure resolves toward *showing* the modal, not hiding it.
   A browser with storage disabled sees this on every load, which is
   mildly annoying and the correct trade.
   ============================================================ */

import { el, make } from '../core/util.js';

/** localStorage key. Fixed name — the version lives in the payload and in the key suffix. */
export const DISCLAIMER_KEY = 'continuum_disclaimer_v1';

/**
 * Bump this whenever the disclaimer text changes in substance, so everyone
 * re-acknowledges. A stored record whose version does not match is treated as
 * no record at all.
 *
 * v2 — added the models-and-grounding paragraph (that module status varies, that
 * nothing is validated against measured human data, and where the inventory
 * lives) and strengthened the acknowledgment sentence. Both change what is being
 * agreed to, so a v1 record no longer counts.
 */
export const DISCLAIMER_VERSION = '2';

/** Elements that get inert-ed while the gate is up, plus the canvas itself. */
const SHIELDED = ['#stage', '#topbar', '#panel-left', '#panel-right', '#telemetry', '#scalebar', '#start'];

export class Disclaimer {
  /**
   * Has this browser acknowledged the current version?
   * Storage errors return false: unreadable state means unacknowledged.
   */
  static get acknowledged() {
    try {
      const raw = localStorage.getItem(DISCLAIMER_KEY);
      if (!raw) return false;
      const rec = JSON.parse(raw);
      return rec?.version === DISCLAIMER_VERSION && !!rec?.acknowledgedAt;
    } catch {
      return false;
    }
  }

  /** The stored record, or null. Exposed for the diagnostics dump. */
  static get record() {
    try {
      return JSON.parse(localStorage.getItem(DISCLAIMER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  /** Clear the acknowledgment. Development helper, reached from the console. */
  static reset() {
    try {
      localStorage.removeItem(DISCLAIMER_KEY);
      return true;
    } catch {
      return false;
    }
  }

  static _remember() {
    try {
      localStorage.setItem(
        DISCLAIMER_KEY,
        JSON.stringify({
          version: DISCLAIMER_VERSION,
          acknowledgedAt: new Date().toISOString(),
        })
      );
    } catch {
      /* A browser that cannot remember this will ask again next load. That is
         the safe direction to fail in, so there is nothing to handle. */
    }
  }

  constructor() {
    this.root = el('#disclaimer');
    this.card = this.root?.querySelector('.disclaimer-card');
    this.check = el('#disclaimer-check');
    this.button = el('#disclaimer-accept');
    this._onKey = this._onKey.bind(this);
    this._resolve = null;
    this._prevFocus = null;
  }

  /**
   * Put the gate up and resolve once it is accepted.
   * Resolves immediately when the current version is already acknowledged.
   * @returns {Promise<void>}
   */
  require() {
    if (Disclaimer.acknowledged) return Promise.resolve();
    if (!this.root) {
      // The markup is missing, which is a build problem, not a licence to
      // proceed ungated — say so loudly rather than silently opening the app.
      console.error('[continuum] disclaimer markup missing — refusing to start ungated');
      return Promise.reject(new Error('disclaimer markup missing'));
    }
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._open();
    });
  }

  _open() {
    this._prevFocus = document.activeElement;
    this._shield(true);
    this.root.hidden = false;

    this.check.checked = false;
    this._syncButton();
    this.check.addEventListener('change', () => this._syncButton());
    this.button.addEventListener('click', () => this._accept());

    /* Neither of these dismisses anything. They exist so that a click on the
       backdrop or a press of Escape reads as "that did nothing on purpose"
       rather than as an unresponsive page. */
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this._nudge();
    });
    document.addEventListener('keydown', this._onKey, true);

    // focus the checkbox: the first thing that has to happen is reading and ticking
    requestAnimationFrame(() => this.check.focus());
  }

  _syncButton() {
    const ok = this.check.checked;
    this.button.disabled = !ok;
    this.button.setAttribute('aria-disabled', String(!ok));
    if (ok) requestAnimationFrame(() => this.button.focus());
  }

  /** Draw the eye back to the checkbox when someone tries to click past it. */
  _nudge() {
    const row = this.root.querySelector('.disclaimer-ack');
    if (!row) return;
    row.classList.remove('nudge');
    void row.offsetWidth; // restart the animation
    row.classList.add('nudge');
    this.check.focus();
  }

  /**
   * Escape is swallowed; Tab is wrapped inside the card.
   * Capture phase, so the application's own key handlers never see these.
   */
  _onKey(e) {
    if (this.root.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._nudge();
      return;
    }
    if (e.key !== 'Tab') {
      // keys that would otherwise drive the simulation behind the gate
      if (!this.card.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const focusable = [...this.card.querySelectorAll('input, button, a[href]')].filter((n) => !n.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _accept() {
    if (!this.check.checked) return; // belt and braces: the button is also disabled
    Disclaimer._remember();
    this._close();
  }

  _close() {
    document.removeEventListener('keydown', this._onKey, true);
    this.root.hidden = true;
    this._shield(false);
    if (this._prevFocus?.focus) this._prevFocus.focus();
    const done = this._resolve;
    this._resolve = null;
    done?.();
  }

  /**
   * Make the application behind the gate genuinely unusable, not merely covered.
   *
   * `inert` removes a subtree from hit-testing, focus order and the accessibility
   * tree in one attribute, which is exactly the semantics wanted here — a blur
   * and a high z-index only hide the controls from someone who is looking.
   * `pointer-events` is set alongside it for browsers without inert support.
   */
  _shield(on) {
    for (const sel of SHIELDED) {
      const node = el(sel);
      if (!node) continue;
      if (on) {
        node.setAttribute('inert', '');
        node.style.pointerEvents = 'none';
      } else {
        node.removeAttribute('inert');
        node.style.pointerEvents = '';
      }
    }
  }
}

/**
 * The always-on reminder in the top bar.
 *
 * The modal is a moment; this is the part that is still true an hour later,
 * which is why it lives in the one piece of chrome no panel can cover.
 */
export function mountPersistentNotice() {
  const brand = document.querySelector('.tb-brand');
  if (!brand || brand.querySelector('.tb-notice')) return;
  const note = make('span', 'tb-notice');
  note.innerHTML =
    '<span class="tb-notice-full">Simulation · Not diagnostic · Not a medical device</span>' +
    '<span class="tb-notice-short">Simulation · Not diagnostic</span>';
  note.title = 'CONTINUUM is a research and education simulation. It is not a medical device and not a diagnostic tool.';
  brand.appendChild(note);
}
