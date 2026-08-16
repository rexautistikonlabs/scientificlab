/* CONTINUUM — Copyright © 2026 RexMetrix Technologies. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Guard the afferent parameter table.

   Three things this asserts, in order of how much damage they would
   do if they stopped being true:

     1. Every constant the transduction model reads has a record.
        A literal that creeps back into anatomy/info.js is a claim
        with nothing behind it, which is the condition this table
        exists to end.

     2. No record's value drifts from the frozen baseline without
        somebody saying so. This table was introduced as *provenance,
        not retuning* — the numbers were identical before and after,
        and that has to keep being checkable. Changing a value is
        allowed; changing it silently is not, so the baseline lives in
        this file and moving a number means moving it here too.

     3. Values stay inside their own stated ranges. A record whose
        value sits outside the band its own class description prints
        is two parts of the product disagreeing about one receptor.

   Run: node tools/check-afferent-params.mjs   (npm run check:afferent)
   ============================================================ */

import { readFileSync } from 'node:fs';
import { AFFERENT_PARAMS, listAfferentParams, provenanceSummary, rangeViolations } from '../src/data/afferent_params.js';
import { RECEPTORS } from '../src/anatomy/info.js';

const problems = [];
const need = (c, m) => {
  if (!c) problems.push(m);
};

const CLASSES = ['pacinian', 'meissner', 'ruffini', 'free', 'spindle', 'golgi', 'intero'];
const FIELDS = ['bestHz', 'threshold', 'tau', 'phasic', 'cvNum', 'size'];

/* ---- 1. no literals left behind, and every field has a record ---- */
const info = readFileSync(new URL('../src/anatomy/info.js', import.meta.url), 'utf8');
const receptorBlock = info.slice(info.indexOf('export const RECEPTORS = {'), info.indexOf('export const RECEPTOR_ORDER'));
for (const cls of CLASSES) {
  for (const f of FIELDS) {
    need(!!AFFERENT_PARAMS[`${cls}.${f}`], `no provenance record for ${cls}.${f}`);
    const re = new RegExp(`${f}:\\s*AP\\('${cls}',\\s*'${f}'\\)`);
    need(re.test(receptorBlock), `${cls}.${f} is not read from the parameter table — a literal has come back`);
  }
  need(!!RECEPTORS[cls], `receptor class ${cls} disappeared from info.js`);
}

/* ---- 2. the frozen baseline ----
   Captured when the table was introduced, from the values that had been running
   since before it existed. If you intend to change a number, change it here in
   the same commit and say why in the message. */
const BASELINE = {
  'pacinian.bestHz': 180, 'pacinian.threshold': 0.06, 'pacinian.tau': 0.006, 'pacinian.phasic': 0.97, 'pacinian.cvNum': 52, 'pacinian.size': 0.001,
  'meissner.bestHz': 30, 'meissner.threshold': 0.04, 'meissner.tau': 0.03, 'meissner.phasic': 0.85, 'meissner.cvNum': 48, 'meissner.size': 0.00015,
  'ruffini.bestHz': 1.5, 'ruffini.threshold': 0.08, 'ruffini.tau': 0.9, 'ruffini.phasic': 0.18, 'ruffini.cvNum': 45, 'ruffini.size': 0.0005,
  'free.bestHz': 0.6, 'free.threshold': 0.22, 'free.tau': 1.6, 'free.phasic': 0.1, 'free.cvNum': 6, 'free.size': 0.00008,
  'spindle.bestHz': 12, 'spindle.threshold': 0.03, 'spindle.tau': 0.05, 'spindle.phasic': 0.6, 'spindle.cvNum': 95, 'spindle.size': 0.006,
  'golgi.bestHz': 3, 'golgi.threshold': 0.05, 'golgi.tau': 0.28, 'golgi.phasic': 0.3, 'golgi.cvNum': 88, 'golgi.size': 0.001,
  'intero.bestHz': 0.4, 'intero.threshold': 0.12, 'intero.tau': 2.4, 'intero.phasic': 0.12, 'intero.cvNum': 1.2, 'intero.size': 0.0002,
};
for (const [id, expected] of Object.entries(BASELINE)) {
  const rec = AFFERENT_PARAMS[id];
  if (!rec) continue;
  need(
    rec.value === expected,
    `${id} = ${rec.value}, baseline ${expected} — a value moved. If that is intended, update the baseline in this file too.`
  );
}
/* and the value the simulation actually sees must equal the record */
for (const cls of CLASSES) {
  for (const f of FIELDS) {
    const rec = AFFERENT_PARAMS[`${cls}.${f}`];
    if (rec) need(RECEPTORS[cls]?.[f] === rec.value, `${cls}.${f}: info.js reports ${RECEPTORS[cls]?.[f]}, table says ${rec.value}`);
  }
}

/* ---- 3. records are complete and internally consistent ---- */
for (const p of listAfferentParams()) {
  need(typeof p.value === 'number' && Number.isFinite(p.value), `${p.id} has no finite value`);
  need(!!p.unit, `${p.id} has no unit`);
  need((p.biologicalMeaning || '').length > 20, `${p.id} has no biological meaning`);
  need(!!p.species, `${p.id} has no species field`);
  need(!!p.citation?.key, `${p.id} has no citation key`);
  need(p.citation.verified === false || p.citation.doi, `${p.id} is marked verified without a doi — verify means read the source`);
  need((p.notes || '').length > 20, `${p.id} has no notes`);
}
for (const v of rangeViolations()) {
  problems.push(`${v.id} = ${v.value} is outside its own stated range ${JSON.stringify(v.range)}`);
}

if (problems.length) {
  console.error('Afferent parameter table is not intact:\n' + problems.map((p) => `  · ${p}`).join('\n'));
  process.exit(1);
}
const s = provenanceSummary();
console.log(
  `Afferent params intact — ${s.total} records ` +
    `(${Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}), ` +
    `${s.withRange} with a stated range, verified ${s.verified}. Values match the frozen baseline.`
);
