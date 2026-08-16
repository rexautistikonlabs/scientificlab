/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Account and subscription — scaffolding.

   This module is a mock, and it is deliberately a *thin* mock. It does
   exactly three things: hold a session, hold a subscription record, and
   turn the pair into an entitlement claim. It never checks a capability
   and never touches a feature.

   That division is the point. The gate is already enforced in the engine
   against `entitlements`, and `entitlements.applyClaim` is the only way a
   tier ever changes. So the production path is a substitution, not a
   rewrite:

     ┌──────────────┐   token   ┌──────────────┐   claim   ┌──────────────┐
     │ auth provider│ ────────► │ your backend │ ────────► │ applyClaim() │
     │ magic link,  │           │ verify token │           │              │
     │ OAuth, SSO   │           │ + read billing│          │ engine gates │
     └──────────────┘           └──────────────┘           └──────────────┘

   Replace `signIn` with the provider's redirect or magic-link call, and
   replace `_resolveClaim` with the fetch that exchanges the resulting
   token for a claim. Nothing else in the product changes — not one
   capability check, not one locked-state class, not one shader uniform.

   Why the claim is not derived on the client in production: a client that
   decides its own entitlement can be edited. The claim must be issued by
   something the user does not control. This mock does derive it locally,
   which is fine for a demo and is exactly the line that moves server-side.
   ============================================================ */

import { Emitter } from '../core/util.js';
import { entitlements } from './entitlements.js';

const SESSION_KEY = 'continuum.session.v1';

/** Purchasable plans. Prices are illustrative and live in one place. */
export const PLANS = Object.freeze({
  explorer: {
    id: 'explorer',
    name: 'Explorer',
    tier: 'free',
    price: 'Free',
    cadence: '',
    blurb: 'Macro anatomy and the living body at whole-body and region scale.',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    tier: 'premium',
    price: '£24',
    cadence: 'per month',
    blurb: 'Every structure, every scale, every tool, overlays, projects and export.',
  },
  institutional: {
    id: 'institutional',
    name: 'Institutional',
    tier: 'premium',
    price: 'Contact',
    cadence: 'per seat',
    blurb: 'Site licence, offline keys and the ID-addressed API for embedding.',
  },
});

/** Providers the sign-in flow offers. All mocked; all one substitution each. */
export const PROVIDERS = Object.freeze([
  { id: 'email', name: 'Email link', note: 'A one-time link, no password to remember.' },
  { id: 'google', name: 'Google', note: 'OAuth.' },
  { id: 'institution', name: 'Institution', note: 'SAML or OIDC single sign-on.' },
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function read() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.email === 'string' ? s : null;
  } catch {
    return null;
  }
}

function write(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage may be unavailable; the session then lasts one page load */
  }
}

export class Auth extends Emitter {
  constructor() {
    super();
    /**
     * @type {{email: string, name: string, provider: string, signedInAt: string,
     *         plan: string, status: 'active'|'none'|'past_due'|'cancelled',
     *         renews: string|null} | null}
     */
    this.session = read();
    // a stored session is authoritative for this mock, so re-assert its claim on
    // load: a refresh must not silently drop a subscriber to the free tier
    if (this.session) entitlements.applyClaim(this._resolveClaim());
  }

  get signedIn() {
    return !!this.session;
  }

  get plan() {
    return PLANS[this.session?.plan] || PLANS.explorer;
  }

  /** Human-readable state for the account UI. */
  describe() {
    if (!this.session) return { label: 'Not signed in', detail: 'Explorer — no account needed', tone: 'anon' };
    const s = this.session;
    const plan = this.plan;
    if (s.status === 'active') {
      return {
        label: s.email,
        detail: `${plan.name}${s.renews ? ` · renews ${new Date(s.renews).toLocaleDateString()}` : ''}`,
        tone: 'active',
      };
    }
    if (s.status === 'past_due') return { label: s.email, detail: `${plan.name} · payment overdue`, tone: 'warn' };
    if (s.status === 'cancelled') return { label: s.email, detail: `${plan.name} · cancelled`, tone: 'warn' };
    return { label: s.email, detail: 'Signed in · Explorer', tone: 'anon' };
  }

  /**
   * Turn the session and its subscription into an entitlement claim.
   *
   * In production this is a network call: POST the provider's token, receive a
   * signed claim. The shape returned here is the shape that call returns, which
   * is why moving it server-side changes nothing above it.
   */
  _resolveClaim() {
    const s = this.session;
    if (!s) return { tier: 'free', source: 'anonymous', holder: null, plan: null };
    const plan = PLANS[s.plan] || PLANS.explorer;
    const entitled = s.status === 'active' && plan.tier === 'premium';
    return {
      tier: entitled ? 'premium' : 'free',
      holder: s.email,
      plan: plan.id,
      source: 'session',
      issued: s.signedInAt,
      // a real claim is short-lived and refreshed; the mock mirrors the renewal
      expires: entitled ? s.renews : null,
    };
  }

  _commit(reason) {
    write(this.session);
    entitlements.applyClaim(this._resolveClaim());
    this.emit('session', { session: this.session, reason });
  }

  /**
   * Mock sign-in. A real magic-link flow sends a mail here and completes on the
   * return visit; a real OAuth flow redirects. Both end in the same place: a
   * session, then a claim.
   */
  signIn({ email, provider = 'email', name = null } = {}) {
    const addr = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) return { ok: false, reason: 'That does not look like an email address.' };
    const existing = this.session?.email === addr ? this.session : null;
    this.session = {
      email: addr,
      name: name || existing?.name || addr.split('@')[0],
      provider,
      signedInAt: new Date().toISOString(),
      // signing in never grants anything on its own — subscription state does
      plan: existing?.plan || 'explorer',
      status: existing?.status || 'none',
      renews: existing?.renews || null,
    };
    this._commit('signIn');
    return { ok: true, session: this.session };
  }

  signOut() {
    if (!this.session) return false;
    this.session = null;
    write(null);
    entitlements.reset();
    this.emit('session', { session: null, reason: 'signOut' });
    return true;
  }

  /**
   * Mock checkout. A real implementation opens the payment provider's hosted
   * checkout and the subscription arrives by webhook, at which point the next
   * claim refresh carries it. Nothing about the gate changes.
   */
  subscribe(planId = 'professional') {
    if (!this.session) return { ok: false, reason: 'Sign in first — a subscription belongs to an account.' };
    const plan = PLANS[planId];
    if (!plan || plan.tier !== 'premium') return { ok: false, reason: 'That plan is not purchasable here.' };
    const renews = new Date();
    renews.setMonth(renews.getMonth() + 1);
    this.session = { ...this.session, plan: plan.id, status: 'active', renews: renews.toISOString() };
    this._commit('subscribe');
    return { ok: true, plan, session: this.session };
  }

  /** Cancel at period end, the way a real subscription behaves. */
  cancel() {
    if (!this.session || this.session.status !== 'active') return { ok: false, reason: 'Nothing to cancel.' };
    this.session = { ...this.session, status: 'cancelled' };
    // still entitled until the paid period ends, which is what `expires` encodes
    write(this.session);
    this.emit('session', { session: this.session, reason: 'cancel' });
    return { ok: true, until: this.session.renews };
  }

  /**
   * Accept a claim resolved elsewhere — a server response, an SSO assertion, a
   * test harness. Present so an integrator never has to reach into
   * `entitlements` directly or reproduce the claim shape by hand.
   */
  acceptClaim(claim) {
    return entitlements.applyClaim(claim);
  }
}

export const auth = new Auth();
