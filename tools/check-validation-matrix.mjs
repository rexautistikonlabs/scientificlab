/* ============================================================
   Assert that VALIDATION_MATRIX.md still agrees with the code.

   The matrix is the sort of document that decays: a module gets added,
   a status quietly stops being true, and the page keeps asserting
   something nobody checked. This makes that a build failure instead.

   Checks:
     1. every row in validation.js appears in the document
     2. every status in the document is a member of the enum
     3. the status printed for each module matches the code
     4. the headline counts match
     5. no forbidden claim language has crept in

   Run: node tools/check-validation-matrix.mjs
   ============================================================ */

import { readFileSync } from 'node:fs';
import { VALIDATION_ROWS, STATUS, summary } from '../src/platform/validation.js';

const doc = readFileSync(new URL('../VALIDATION_MATRIX.md', import.meta.url), 'utf8');
const problems = [];

/* ---- 1 & 3. every row present, with the right status ---- */
for (const r of VALIDATION_ROWS) {
  const line = doc.split('\n').find((l) => l.includes(`**${r.module}**`));
  if (!line) {
    problems.push(`missing row for "${r.module}"`);
    continue;
  }
  if (!line.includes(`\`${r.status}\``)) {
    problems.push(`status mismatch for "${r.module}": code says ${r.status}, document does not say so`);
  }
}

/* ---- 2. only enum values used as statuses ---- */
const valid = new Set(Object.keys(STATUS));
for (const m of doc.matchAll(/\|\s*`([a-z_0-9]+)`\s*\|/g)) {
  const token = m[1];
  // status-shaped tokens only: ignore inline code that happens to sit in a cell
  if (/^(grounded|partial|novel|speculative|out_of_scope|out_of_scope_v1|validated|verified|proven)$/.test(token)) {
    if (!valid.has(token)) problems.push(`"${token}" is not a member of the status enum`);
  }
}

/* ---- 4. counts ---- */
const s = summary();
for (const [status, n] of Object.entries(s.counts)) {
  if (!doc.includes(`| \`${status}\` | ${n} |`)) {
    problems.push(`count for ${status} should be ${n}; document disagrees`);
  }
}
if (!doc.includes(`${s.total} modules`)) problems.push(`total should be ${s.total} modules`);

/* ---- 5. claim language ---- */
const forbidden = [
  'proves rex',
  'validates the hypothesis',
  'validated against blum',
  'matches published data',
  'clinically validated',
  'fda',
  'diagnostic tool',
];
const low = doc.toLowerCase();
for (const f of forbidden) {
  if (low.includes(f)) problems.push(`forbidden claim language: "${f}"`);
}
/* A percentage presented as a validation or fidelity score, in either word
   order — "fidelity: 87 %" and "87 % fidelity" are the same claim. */
const scorePatterns = [
  /(fidelity|accuracy|agreement|validation|match)\s*(score)?\s*[:=]?\s*\d+(\.\d+)?\s*%/gi,
  /\d+(\.\d+)?\s*%\s*(fidelity|accuracy|agreement|validation|match)/gi,
];
for (const re of scorePatterns) {
  for (const m of doc.matchAll(re)) problems.push(`score-shaped percentage: "${m[0]}"`);
}

if (problems.length) {
  console.error('VALIDATION_MATRIX.md is out of date:\n' + problems.map((p) => `  · ${p}`).join('\n'));
  process.exit(1);
}
console.log(
  `VALIDATION_MATRIX.md agrees with validation.js — ${s.total} modules ` +
    `(${Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(', ')}), validated against measured data: ${s.validatedAgainstMeasuredData}`
);
