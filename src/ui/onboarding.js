/* ============================================================
   First-run guidance.

   Three things are genuinely not discoverable in this product: that the
   wheel traverses five orders of magnitude rather than just zooming,
   that shift-click accumulates a selection across systems, and where
   the free tier ends. Everything else — layer toggles, the inspector,
   the meters — is visible and self-labelling, so it gets no coach mark.

   Deliberately not a modal tour. It is a sequence of small cards
   anchored to the thing they describe, each dismissible, the whole
   sequence skippable, and it never runs twice. A product that makes a
   returning user close a tour has taught them to close things.
   ============================================================ */

import { el, make } from '../core/util.js';
import { entitlements } from '../platform/entitlements.js';

const KEY = 'continuum.onboarded.v1';

/**
 * @typedef {object} Step
 * @property {string} anchor     selector of the element to point at
 * @property {'below'|'above'|'right'|'left'} side
 * @property {string} title
 * @property {string} body
 */

export class Onboarding {
  constructor({ premium }) {
    this.premium = premium;
    this.host = el('#coach');
    this.index = -1;
    this.steps = [];
  }

  static get seen() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return true; // no storage → treat as seen rather than nagging every load
    }
  }

  static forget() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  _mark() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  }

  /** Build the step list for the current licence and start, unless already seen. */
  start({ force = false } = {}) {
    if (!force && Onboarding.seen) return false;
    const pro = entitlements.isPremium;
    this.steps = [
      {
        anchor: '#scale-rail',
        side: 'below',
        title: 'Scale is continuous',
        body:
          'The wheel does not just zoom — it traverses five orders of magnitude, from the whole body to a single ' +
          `nerve ending. ${
            pro
              ? 'Enveloping layers fade and the view sections itself as you descend, so you can look at a heart without deleting the chest wall.'
              : 'Explorer covers the body and region tiers; the organ, tissue and receptor tiers are Professional.'
          } Keys <kbd>1</kbd>–<kbd>5</kbd> jump between tiers.`,
      },
      {
        anchor: '#panel-left',
        side: 'right',
        title: 'Every structure is selectable',
        body:
          'Click any structure to inspect it. <b>Shift-click</b> adds to the selection, so you can hold a bone, ' +
          'the fascia investing it and the nerve leaving it together and treat them as one target. ' +
          '<b>Double-click</b> flies to a structure; <kbd>I</kbd> isolates, <kbd>X</kbd> hides, <kbd>R</kbd> resets.',
      },
      {
        anchor: '#telemetry',
        side: 'above',
        title: 'The body is already alive',
        body:
          'Nothing here is a still image. The heart, the breath, visceral motility and fluid transport are running, ' +
          'and every meter reads from the same solve that moves the tissue. Load one end of a myofascial line and ' +
          'watch the numbers change everywhere else.',
      },
    ];
    if (!pro) {
      this.steps.push({
        anchor: '#btn-tier',
        side: 'below',
        title: 'Explorer edition',
        body:
          'Macro anatomy, single selection and the basic live telemetry are yours. The deep scales, every tissue ' +
          'layer, mechanical intervention, measurement, annotation and the full instrument panel are Professional. ' +
          'Locked controls stay visible so you can see what they would tell you.',
        // an offer, not a wall: the primary action still ends the sequence
        link: 'See the plan',
      });
    }
    this.index = 0;
    this._render();
    return true;
  }

  stop(markSeen = true) {
    if (markSeen) this._mark();
    this.index = -1;
    this.host.innerHTML = '';
    this.host.hidden = true;
  }

  next() {
    this.index++;
    if (this.index >= this.steps.length) this.stop();
    else this._render();
  }

  _render() {
    const step = this.steps[this.index];
    if (!step) return this.stop();
    const anchor = document.querySelector(step.anchor);
    if (!anchor || anchor.hidden) return this.next();

    this.host.hidden = false;
    this.host.innerHTML = '';
    const card = make('div', `coach coach-${step.side}`);
    const last = this.index === this.steps.length - 1;
    card.innerHTML = `
      <div class="coach-step">${this.index + 1} / ${this.steps.length}</div>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <div class="coach-actions">
        ${step.link ? `<button class="btn btn-sm coach-link">${step.link}</button>` : ''}
        <button class="btn btn-sm coach-skip">${last ? 'Dismiss' : 'Skip'}</button>
        <button class="btn btn-sm btn-primary coach-next">${last ? 'Start exploring' : 'Next'}</button>
      </div>`;
    this.host.appendChild(card);

    card.querySelector('.coach-next').addEventListener('click', () => this.next());
    card.querySelector('.coach-skip').addEventListener('click', () => this.stop());
    card.querySelector('.coach-link')?.addEventListener('click', () => {
      this.stop();
      this.premium?.open();
    });

    this._place(card, anchor, step.side);
    this._resize = () => this._place(card, anchor, step.side);
    window.addEventListener('resize', this._resize, { once: true });
  }

  /** Position the card against its anchor, kept inside the viewport. */
  _place(card, anchor, side) {
    const a = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const m = 14;
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
    card.style.left = `${Math.round(Math.max(m, Math.min(x, window.innerWidth - w - m)))}px`;
    card.style.top = `${Math.round(Math.max(56, Math.min(y, window.innerHeight - h - m)))}px`;
  }
}
