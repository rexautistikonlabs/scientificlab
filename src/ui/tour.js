/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   The guided tour.

   This is the old first-run onboarding grown into a full walkthrough,
   not a second system beside it. The card, the anchor placement and the
   directional arrow are the same coach-mark pattern that was already
   here; what is new is the step list, a spotlight on the region being
   described, keyboard control, versioned storage, and steps that adapt
   to what the current licence can actually reach.

   Two shapes of step:

     • anchored — a card pinned to a real region of the interface, with
       that region lit and everything else dimmed. This is the default,
       because a tour that describes the Inspector without pointing at
       the Inspector is a manual, not a tour.
     • centred — no anchor, used only for the opening and closing cards,
       where there is nothing specific to point at yet.

   Deliberately not modal. The spotlight and the dim layer do not take
   pointer events, so the model keeps running and can still be dragged
   while the tour is open. Someone who starts orbiting mid-tour is doing
   exactly what the tour is asking them to do, and blocking that to
   protect the sequence would be backwards.

   The disclaimer gate is the one thing that outranks this: the tour is
   started only after that promise resolves, and its z-index sits below.
   ============================================================ */

import { el, make } from '../core/util.js';
import { entitlements } from '../platform/entitlements.js';

/** localStorage key. */
export const TOUR_KEY = 'continuum_tour_v1';

/**
 * Bump when the steps change enough to be worth seeing again. A completion
 * record whose version does not match is treated as no record, so everyone gets
 * the new tour once and once only.
 */
export const TOUR_VERSION = '1';

export class Tour {
  /**
   * @param {object} o
   * @param {{open:Function}} [o.premium]  upgrade dialog, for the locked-feature step
   * @param {object} [o.scales]            ScaleManager, so a step can demonstrate a scale move
   * @param {object} [o.store]
   */
  constructor({ premium = null, scales = null, store = null } = {}) {
    this.premium = premium;
    this.scales = scales;
    this.store = store;
    this.host = el('#coach');
    this.index = -1;
    this.steps = [];
    this.running = false;
    this._onKey = this._onKey.bind(this);
    this._reflow = this._reflow.bind(this);
  }

  /* ---------------- persistence ---------------- */

  static get completed() {
    try {
      const rec = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null');
      return rec?.version === TOUR_VERSION && !!rec?.completedAt;
    } catch {
      // Unreadable storage means we cannot tell whether they have seen it.
      // Treat that as seen: nagging every single load is the worse failure.
      return true;
    }
  }

  static get record() {
    try {
      return JSON.parse(localStorage.getItem(TOUR_KEY) || 'null');
    } catch {
      return null;
    }
  }

  static reset() {
    try {
      localStorage.removeItem(TOUR_KEY);
      return true;
    } catch {
      return false;
    }
  }

  static _remember() {
    try {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ version: TOUR_VERSION, completedAt: new Date().toISOString() }));
    } catch {
      /* a browser that cannot remember gets the tour again; harmless */
    }
  }

  /* ---------------- steps ---------------- */

  /**
   * The step list, built against the current licence.
   *
   * Every body is under fifty words. Steps whose subject is locked keep their
   * place and say what tier reaches them — the product already shows locked
   * controls rather than hiding them, and a tour that silently skipped half the
   * application would leave a free user not knowing what they had not seen.
   */
  _build() {
    const pro = entitlements.isPremium;
    const steps = [
      {
        id: 'welcome',
        title: 'Welcome to CONTINUUM',
        body:
          'A simulation of the body as one continuous tension network — for research and education, not for ' +
          'diagnosis. Nine short steps and you will know your way around.',
      },
      {
        id: 'navigate',
        anchor: '#stage',
        side: 'centre-low',
        title: 'Move around the body',
        body:
          'Drag to orbit, right-drag or two-finger drag to pan, wheel or pinch to move in and out. The heart and ' +
          'the breath are already running — nothing here is a still image.',
      },
      {
        id: 'scale',
        anchor: '#scale-rail',
        side: 'below',
        title: 'Scale is one continuum',
        body: pro
          ? 'The wheel traverses five orders of magnitude, whole body to single nerve ending. Enveloping layers ' +
            'thin as you descend, so you can reach an organ without deleting the chest wall. Keys 1–5 jump.'
          : 'The wheel traverses five orders of magnitude, whole body to single nerve ending. Explorer covers Body ' +
            'and Region; Organ, Tissue and Receptor are Professional. Keys 1–5 jump between tiers.',
      },
      {
        id: 'systems',
        anchor: '#panel-left',
        side: 'right',
        title: 'Turn systems on and off',
        body:
          'Skin, fascia, muscle, bone, organs, nerves, vessels and mechanoreceptors, each independent. Isolate one ' +
          'to read it clearly, or stack several to see how they invest each other.',
      },
      {
        id: 'inspect',
        anchor: '#inspector',
        side: 'left',
        title: 'Click to inspect',
        body:
          'Click any structure and the Inspector reads its live mechanical state, its sensory population and the ' +
          'pathway it feeds. Shift-click adds to a selection; double-click flies to it.',
      },
      {
        id: 'intervene',
        anchor: '#sec-intervention',
        side: 'left',
        title: 'Load the tissue',
        body: pro
          ? 'Pick tension, compression, restriction, shear or release, set a magnitude and radius, and apply it to ' +
            'your selection. Force redistributes along the whole myofascial line — watch the far end move.'
          : 'Mechanical intervention applies tension, compression, restriction, shear or release to a selection, ' +
            'and force redistributes along the whole myofascial line. Professional unlocks it.',
        link: pro ? null : 'See the plan',
      },
      {
        id: 'telemetry',
        anchor: '#telemetry',
        side: 'above',
        title: 'Read the live instrument',
        body:
          'Every meter reads from the same solve that moves the tissue. Network load is tension against rest; ' +
          'fidelity is how much of an event survives the tissue; afferent rate is what actually arrives.',
      },
      {
        id: 'microscope',
        anchor: '#sec-microscope',
        side: 'left',
        title: 'Microscope mode',
        body: pro
          ? 'Keep zooming past Tissue, or press Shift+M, and one muscle spindle takes over. Its stretch, firing ' +
            'rate and spike timing come from the model. The view is schematic and model-driven, not microscopy.'
          : 'Past the Tissue tier one muscle spindle takes over, its stretch and spike timing driven by the model. ' +
            'The view is schematic and model-driven, not microscopy. Professional reaches it.',
      },
      {
        id: 'help',
        anchor: '#btn-help',
        side: 'below',
        title: 'Help is always here',
        body: 'Press ? for the full reference, every shortcut, and a button to run this tour again whenever you want it.',
      },
      {
        id: 'done',
        title: 'Go and explore',
        body:
          'Load one end of a myofascial line and watch the other end answer. Everything you see is a simulation — ' +
          'not a medical device, not diagnostic, and not about any individual body.',
      },
    ];
    return steps;
  }

  /* ---------------- lifecycle ---------------- */

  /**
   * Run the tour.
   * @param {object} [o]
   * @param {boolean} [o.force] run even when it has already been completed
   * @returns {boolean} whether it started
   */
  start({ force = false } = {}) {
    if (this.running) return false;
    if (!force && Tour.completed) return false;
    if (!this.host) return false;

    this.steps = this._build();
    this.index = 0;
    this.running = true;
    this._mountSpotlight();
    document.addEventListener('keydown', this._onKey, true);
    window.addEventListener('resize', this._reflow);
    this._render();
    return true;
  }

  /** Finish the tour. Reaching the end and skipping both count as done. */
  stop({ remember = true } = {}) {
    if (!this.running) return;
    this.running = false;
    if (remember) Tour._remember();
    document.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('resize', this._reflow);
    this.index = -1;
    this.host.innerHTML = '';
    this.host.hidden = true;
    this._unmountSpotlight();
  }

  next() {
    if (!this.running) return;
    this.index++;
    if (this.index >= this.steps.length) this.stop();
    else this._render();
  }

  back() {
    if (!this.running || this.index <= 0) return;
    this.index--;
    this._render();
  }

  /**
   * Enter advances, Escape leaves. Escape is deliberately *not* what the
   * disclaimer does — that one refuses to close, this one should let go the
   * moment somebody wants it gone.
   */
  _onKey(e) {
    if (!this.running) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stop();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.next();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.back();
    }
  }

  /* ---------------- rendering ---------------- */

  _render() {
    const step = this.steps[this.index];
    if (!step) return this.stop();

    /* An anchor that does not exist, or is hidden at this viewport, loses its
       spotlight and its arrow but keeps its card — the text is the content, and
       dropping a step because a panel is collapsed would teach less, silently. */
    const anchor = step.anchor ? document.querySelector(step.anchor) : null;
    const live = anchor && !anchor.hidden && anchor.getBoundingClientRect().width > 0;

    this.host.hidden = false;
    this.host.innerHTML = '';

    const side = live ? step.side || 'below' : 'centre';
    const card = make('div', `coach coach-${side} tour-card`);
    const last = this.index === this.steps.length - 1;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', `Guided tour, step ${this.index + 1} of ${this.steps.length}`);
    card.innerHTML = `
      <div class="coach-step">
        <span>${this.index + 1} / ${this.steps.length}</span>
        <span class="tour-dots">${this.steps
          .map((_, i) => `<i class="${i === this.index ? 'on' : i < this.index ? 'past' : ''}"></i>`)
          .join('')}</span>
      </div>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <div class="coach-actions">
        ${step.link ? `<button class="btn btn-sm coach-link">${step.link}</button>` : ''}
        <button class="btn btn-sm coach-skip">${last ? 'Close' : 'Skip tour'}</button>
        <button class="btn btn-sm btn-primary coach-next">${last ? 'Done' : 'Next'}</button>
      </div>`;
    this.host.appendChild(card);

    card.querySelector('.coach-next').addEventListener('click', () => this.next());
    card.querySelector('.coach-skip').addEventListener('click', () => this.stop());
    card.querySelector('.coach-link')?.addEventListener('click', () => {
      this.stop();
      this.premium?.open();
    });

    this._card = card;
    this._anchor = live ? anchor : null;
    this._side = side;
    this._reflow();

    // the primary action takes focus, so Enter and Space both do the obvious thing
    requestAnimationFrame(() => card.querySelector('.coach-next')?.focus());
  }

  _reflow() {
    if (!this._card) return;
    this._place(this._card, this._anchor, this._side);
    this._spot(this._anchor);
  }

  /**
   * Position the card against its anchor, kept inside the viewport.
   *
   * `centre` and `centre-low` place the card in the middle of the screen — the
   * first for steps with nothing to point at, the second for the navigation step,
   * whose subject is the whole viewport and which therefore sits low enough not
   * to cover the body it is describing.
   */
  _place(card, anchor, side) {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const m = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!anchor || side === 'centre' || side === 'centre-low') {
      card.style.left = `${Math.round((vw - w) / 2)}px`;
      card.style.top = `${Math.round(side === 'centre-low' ? vh * 0.62 : (vh - h) / 2)}px`;
      return;
    }

    const a = anchor.getBoundingClientRect();
    let x;
    let y;
    if (side === 'below') {
      x = a.left + a.width / 2 - w / 2;
      y = a.bottom + m;
    } else if (side === 'above') {
      x = a.left + a.width / 2 - w / 2;
      y = a.top - h - m;
    } else if (side === 'right') {
      x = a.right + m;
      y = a.top + Math.min(a.height / 2, 120) - h / 2;
    } else {
      x = a.left - w - m;
      y = a.top + Math.min(a.height / 2, 120) - h / 2;
    }

    /* On a narrow window the side panels leave no room beside them, so a card
       placed left or right would be clamped over the panel it is pointing at.
       Below the anchor is always readable, so that is where it goes. */
    const tooTight = (side === 'right' && a.right + m + w > vw) || (side === 'left' && a.left - m - w < 0);
    if (tooTight) {
      card.classList.remove(`coach-${side}`);
      card.classList.add('coach-centre');
      x = (vw - w) / 2;
      y = Math.min(a.bottom + m, vh - h - m);
    }

    card.style.left = `${Math.round(Math.max(m, Math.min(x, vw - w - m)))}px`;
    card.style.top = `${Math.round(Math.max(56, Math.min(y, vh - h - m)))}px`;
  }

  /* ---------------- spotlight ---------------- */

  _mountSpotlight() {
    if (this.spot) return;
    this.spot = make('div', 'tour-spot');
    this.spot.hidden = true;
    this.host.parentElement.insertBefore(this.spot, this.host);
  }

  _unmountSpotlight() {
    this.spot?.remove();
    this.spot = null;
  }

  /**
   * Light the anchor and dim everything else.
   *
   * One element with an enormous spread shadow: the box is the hole, the shadow
   * is the dim. No pointer events on it, so the tour describes the interface
   * without taking it away — the model can still be dragged mid-step.
   */
  _spot(anchor) {
    if (!this.spot) return;
    if (!anchor) {
      this.spot.hidden = true;
      return;
    }
    const a = anchor.getBoundingClientRect();
    const pad = 6;
    this.spot.hidden = false;
    this.spot.style.left = `${Math.round(a.left - pad)}px`;
    this.spot.style.top = `${Math.round(a.top - pad)}px`;
    this.spot.style.width = `${Math.round(a.width + pad * 2)}px`;
    this.spot.style.height = `${Math.round(a.height + pad * 2)}px`;
  }
}
