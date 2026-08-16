/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Assert that the mandatory gate is still wired and still mandatory.

   This exists because the gate went missing once. Not from a bug — a
   working copy was taken from a commit before the gate landed, and
   nothing anywhere said "this build has no gate". A product whose
   central promise can be absent without anything noticing has the
   wrong kind of silence in it.

   Static checks only, so it runs in CI without a browser. The
   behavioural checks — Escape, backdrop, inert, focus trap — live in
   the Playwright suite; these are the ones that catch the gate being
   deleted, unwired, or quietly made skippable.

   Run: node tools/check-disclaimer.mjs   (npm run check:disclaimer)
   ============================================================ */

import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const problems = [];
const need = (cond, msg) => {
  if (!cond) problems.push(msg);
};

/* ---- the markup exists ---- */
const html = read('index.html');
need(/id="disclaimer"/.test(html), 'index.html has no #disclaimer element');
need(/id="disclaimer-check"/.test(html), 'no acknowledgment checkbox');
need(/id="disclaimer-accept"/.test(html), 'no accept button');
need(/aria-modal="true"/.test(html.match(/<div\s+id="disclaimer"[\s\S]{0,400}/)?.[0] ?? ''), 'gate is not marked aria-modal');
need(
  !/<div\s+id="disclaimer"[\s\S]{0,2000}?class="overlay-x"/.test(html),
  'gate has a close control — it must not be dismissable'
);
need(/disclaimer-accept[^>]*disabled/.test(html), 'accept button does not start disabled');

/* ---- required disclaimer points, in the gate itself ---- */
const gate = html.slice(html.indexOf('id="disclaimer"'), html.indexOf('<!-- Hover tooltip'));
const points = [
  [/simulation/i, 'the word "simulation"'],
  [/not<\/b>\s*a medical device|not a medical device/i, '"not a medical device"'],
  [/not<\/b>\s*a diagnostic tool|not a diagnostic tool/i, '"not a diagnostic tool"'],
  [/substitute for professional medical advice/i, '"not a substitute for professional medical advice"'],
  [/patient-specific clinical measurements/i, '"no patient-specific clinical measurements"'],
  [/exaggerated/i, 'the display-exaggeration point'],
  [/model outputs/i, '"model outputs, not lab recordings"'],
  [/clinical decisions/i, '"do not use to make clinical decisions"'],
  [/validated against\s*measured human data|validated against measured human data/i, 'the "nothing is validated" line'],
  [/grounded/i, 'the models-and-grounding paragraph'],
  [/10\.7554\/eLife\.55177/, 'the Blum DOI'],
];
for (const [re, what] of points) need(re.test(gate), `gate is missing ${what}`);

/* ---- the module still behaves as a gate ---- */
const js = read('src/ui/disclaimer.js');
/* Assert the *calls*, not the words. Both terms appear in this file's own prose,
   so a substring check passed happily after the shielding was deleted — which is
   exactly the regression this guard exists to catch. */
need(/setAttribute\('inert'/.test(js), 'disclaimer.js no longer sets the inert attribute on the app');
need(/removeAttribute\('inert'/.test(js), 'disclaimer.js never clears inert — the app would stay dead after accepting');
need(/style\.pointerEvents\s*=\s*'none'/.test(js), 'disclaimer.js no longer sets pointer-events:none on the shielded app');
need(/_shield\(true\)/.test(js) && /_shield\(false\)/.test(js), 'the shield is not raised and lowered around the gate');
need(/e\.key === 'Escape'[\s\S]{0,200}preventDefault/.test(js), 'Escape is no longer swallowed');
need(/DISCLAIMER_VERSION/.test(js), 'no version constant');
need(/continuum_disclaimer_v1/.test(js), 'storage key changed unexpectedly');
need(/acknowledgedAt/.test(js), 'stored record no longer carries acknowledgedAt');
need(/refusing to start ungated/.test(js), 'missing markup no longer fails closed');

/* ---- main.js awaits it before the workspace, and ?skip does not bypass ---- */
const main = read('src/main.js');
need(/disclaimer\.require\(\)/.test(main), 'main.js never calls disclaimer.require()');
const requireBlock = main.slice(main.indexOf('disclaimer.require()'), main.indexOf('disclaimer.require()') + 600);
need(/enterWorkspace|startEl\.hidden/.test(requireBlock), 'the workspace is not opened inside the require() continuation');
/* The skip parameter must be read *inside* the resolution, never as a way past it. */
const skipUses = [...main.matchAll(/\[\?&\]skip\\b/g)];
need(skipUses.length > 0, 'the ?skip parameter handling disappeared');
for (const m of skipUses) {
  const before = main.slice(Math.max(0, m.index - 700), m.index);
  need(
    before.includes('disclaimer.require()'),
    '?skip is evaluated outside the disclaimer continuation — it could bypass the gate'
  );
}
need(/mountPersistentNotice\(\)/.test(main), 'the persistent top-bar notice is not mounted');
need(/disclaimer:\s*\{[\s\S]{0,300}reset:/.test(main), 'CONTINUUM.disclaimer.reset() is not exposed');

/* ---- version discipline ---- */
const version = js.match(/DISCLAIMER_VERSION\s*=\s*'([^']+)'/)?.[1];
need(!!version, 'could not read DISCLAIMER_VERSION');

if (problems.length) {
  console.error('The disclaimer gate is not intact:\n' + problems.map((p) => `  · ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Disclaimer gate intact — version ${version}, all required points present, ?skip cannot bypass it.`);
