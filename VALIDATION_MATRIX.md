# Validation matrix

What is actually grounded in this product, and what is not.

This is an inventory, not a certificate. **No row in this table is validated
against measured data**, because this product holds no measured series — and the
status enum deliberately has no value that would let a row claim otherwise.

The table is generated from `src/platform/validation.js`, which is the
machine-readable twin of this document. `CONTINUUM.validation.summary()` returns
the counts, and a repo check asserts that the two agree, so this page cannot
quietly drift away from the code it describes.

---

## Status enum

| status | meaning |
|---|---|
| `grounded` | Behaviour or equation pattern is citable. May still be simplified — *grounded* is not *validated*. |
| `partial` | Structure present; parameters illustrative or carrying `verified: false`. |
| `novel` | Specific to this product. Needs foundation experiments before any predictive claim. |
| `speculative` | A composite or an assumption with no external anchor. |
| `out_of_scope_v1` | Not implemented, and not required for the claims this version makes. |

### Current counts

| status | modules |
|---|---|
| `grounded` | 3 |
| `partial` | 7 |
| `novel` | 3 |
| `speculative` | 1 |
| `out_of_scope_v1` | 2 |

16 modules. Validated against measured data: **0**.

---

## The matrix

| # | Module | Code / UI surface | Scientific anchor | Validation target | Status | Evidence in repo | Next action |
|---|---|---|---|---|---|---|---|
| 1 | **Multi-scale anatomy & tensegrity visualisation** | anatomy/, gfx/, core/scales.js — the 3D view and scale ladder | citation pending — published adult proportions, no specific source recorded in code | Structure positions and proportions checked against a named anatomical reference. | `partial` | 271 structures + 1 469 receptor endings, procedurally generated, 1740 IDs with manifest hash 238ca549. Proportions are asserted in prose; no per-structure provenance field exists. | Record a reference per system, or state plainly that geometry is illustrative rather than metric. |
| 2 | **Live mechanical / tensegrity solve** | sim/tensegrity.js — position-based dynamics, tension-only cables | citation pending — biotensegrity literature for the qualitative premise; PBD is a standard method, not a claim about tissue | Load-distribution pattern compared against a published whole-body measurement, or explicit statement that it is qualitative. | `partial` | 469 elements, 166 nodes, deterministic settle, reproducible continuity figures (plantar tension → +8.8 % calf, +12.1 % lumbar, +1.0 % cervical). Numbers are stable and self-consistent; nothing external anchors their magnitude. | Say explicitly in the README that the attenuation profile is a modelled pattern, not a measured one. |
| 3 | **Interventions (tension, compression, restriction, shear, release)** | core/store.js TOOLS, sim/tensegrity.js interventions, right panel | citation pending | Each mode mapped to a defined tissue-mechanical change with a source, rather than a tuned solver effect. | `partial` | Five modes applied through one solver path with magnitude and radius. Directions are plausible and internally consistent. | Document what each mode does to the solver in one line each, the way METRICS.md does for the metrics. |
| 4 | **Whole-body afferent / transmission path** | sim/afferent.js, data/afferent_params.js, anatomy/info.js receptor descriptors, telemetry strip | TEXTBOOK_CONSENSUS_BAND / _CV / _SIZE — category labels, not references; MODEL_TUNING — 21 of 42 constants have no external anchor at all | Each of the 21 range-anchored constants checked against a named primary source and marked verified individually. The 21 MODEL_TUNING constants cannot reach that bar — they would need a calibration this product does not have. | `partial` | All 42 constants the transduction model reads now carry a unit, a biological meaning, a species field, a stated range where one exists, a citation category and notes — data/afferent_params.js, with anatomy/info.js reading from it rather than holding literals. Values are unchanged and frozen against a baseline that tools/check-afferent-params.mjs enforces. **Verified: 0.** The honest split the table forced: 21 are MODEL_TUNING (every tau, threshold and phasic) with no source and, for threshold, no physical unit at all; 21 sit inside a textbook-consensus band, where the *range* is the citable part and the point value is still a choice nobody sourced. | Source the 14 range-anchored records that have numeric ranges, one at a time, setting verified:true only on records whose paper a human has actually read. See AFFERENT_PARAMS.md for the checklist. The MODEL_TUNING group should be described as tuning in any write-up rather than quietly presented as physiology. |
| 5 | **Microscope Basic spindle drive (default)** | sim/spindle.js iaRate(), Microscope panel → Drive model → Basic | prochazka1999; prochazka1998; matthews1972; hunt1990 | Parameters checked against the primary sources and marked verified. | `partial` | r = r₀ + k_v·[v]₊^p + k_L·a(t)·ΔL — a citable model *shape*. All parameter records carry verified:false and null DOIs. Direction verified in-repo: rate rises with length, adaptation relaxes to a floor and recovers. | A human checks each of the eight parameters against its paper and sets verified:true individually. |
| 6 | **Microscope Extended drive (history, tension/yank-style, γ)** | sim/spindle_extended.js, Microscope panel → Drive model → Extended | blum2020 — doi:10.7554/eLife.55177, inspiration for qualitative targets only | Qualitative targets reproduced: history dependence recovering over seconds, and a dynamic response that grows with stretch velocity. Never a numeric match to any figure. | `partial` | Both qualitative targets met in-repo: second-stretch ratio 0.57 at 0.5 s recovering to 0.98 at 10 s, monotone in the gap; early burst 98→208 Hz across a 2–16.7 mm/s ramp series with the plateau moving 1 %. All 14 parameters verified:false — the citation key marks the *phenomenon*, not the value, and none of the values comes from the paper. | Keep the wording as inspiration. Any move beyond partial needs a digitised comparison series, which this product does not have and should not fabricate. |
| 7 | **Spike timing & conduction delay** | sim/spindle.js — exact integrate-and-fire, conductionDelay() | burke_gandevia (conduction velocity); NEEDS_PRIMARY_SOURCE (path length, synaptic delay) | Path length and synaptic delay given real sources; conduction velocity range confirmed. | `partial` | Integrate-and-fire is exact: constant drive gives ISI = 1/r with CV = 0, verified offline. Delay arithmetic verified across five path-length and velocity conditions. Two of its three parameters carry the placeholder key NEEDS_PRIMARY_SOURCE. | Source the path length and synaptic delay, or state a defended assumption for each. |
| 8 | **Literature protocol presets / scenarios** | sim/spindle_extended.js PROTOCOLS, Microscope panel → Scenario | shape only — ramp–hold–release is a standard stretch protocol form | Nothing further. These are stimulus shapes, not results. | `grounded` | Seven presets. Amplitudes are stated as educational values chosen to avoid saturation, not taken from any figure. Each carries an expected *direction* and a safeFor field; mismatched drive/preset pairs are warned about before running. | None. Resist any pressure to attach a score to these — there is no series here to score against. |
| 9 | **Computational experiment (baseline vs perturbation)** | sim/experiment.js, right panel → Computational experiment | method is a controlled comparison; no external anchor is needed for the method itself | That the two conditions differ only by the perturbation. Verified by construction. | `grounded` | Same protocol, same drive code, same seed; only the input differs. Monotone in magnitude for both delivered strain and peak rate. Saturation is detected and warned about rather than hidden. Every result carries EXPERIMENT_CAPTION. | None for the method. What the method is *applied to* is what carries the uncertainty, and those rows are above and below. |
| 10 | **Restriction perturbation model (k_trans, lag)** | sim/experiment.js perturbationTerms(), params keyed REX_MODELLING_ASSUMPTION | none — explicitly this product’s own assumption | A measurement relating an applied manual or mechanical intervention to the excursion actually delivered at depth, and to the local time constant. Neither exists here. | `novel` | transmission = 1/(1 + k_trans·m); tau = tau_0·(1 + k_lag·m). Three parameters, all verified:false, all carrying a citation key that says outright there is no literature source. Shapes are reused from the whole-body afferent model so the two paths cannot disagree in direction — which is consistency, not evidence. | This is the row that most needs foundation measurement. Until then no experiment result that depends on it may be described as anything but a prediction under an assumption. |
| 11 | **Level C composite metrics (network load, signal integrity, fidelity, latency, bandwidth, asymmetry, …)** | platform/layers.js OUTPUTS, sim/afferent.js, sim/tensegrity.js, telemetry strip | none — these are summaries defined here; see METRICS.md | Not applicable as science. The target is that each one states its formula and is never read as a measurement. | `speculative` | All ten meters tagged “C” with the formula in the tooltip. METRICS.md gives each definition. Signal integrity is fidelity^0.5 × bandwidth^0.3 × timing^0.2 — the exponents are a chosen weighting and METRICS.md says so. | Keep them labelled. Never retune a weighting to make a visualisation look right. |
| 12 | **Entitlements / freemium gates** | platform/entitlements.js, platform/auth.js, locked UI states | not applicable — product, not science | That gates hold at the engine, not only in the UI. | `grounded` | Capability model enforced at the source. Verified: free tier cannot reach deep scale by wheel, tier jump, direct span call or scripted flag write; ten capabilities blocked; overlay painting gated at paintOverlay() after a scripted bypass was found and closed. | None. Re-run the gate suite whenever a new capability is added. |
| 13 | **Golgi tendon organ / Ib mechanics** | anatomy/info.js golgi class + population rate coding only — no dedicated Ib model | citation pending | A force-driven Ib model with tendon-organ mechanics, comparable to the spindle micro path. | `out_of_scope_v1` | A Golgi population *exists* in the whole-body afferent model with its own band, tau and threshold, and appears in the telemetry breakdown. There is no Ib micro-mechanical model, no force-based drive, and no tendon-organ geometry. The Microscope hooks would take one (the spike generator and conduction stage are receptor-agnostic). | Leave out of v1. If added, it needs its own parameter table before it earns any status above partial. |
| 14 | **Full constitutive soft-tissue FEM** | not implemented | not applicable | A continuum formulation with a constitutive law, meshing and convergence testing. | `out_of_scope_v1` | None. The solver is position-based dynamics on a discrete network — deliberately, because it runs at 60 fps in a browser and expresses the continuity premise. It is not a stress analysis and does not report stress. | Leave out of v1. Adding it would change what the product is, not just what it computes. |
| 15 | **Surface device calibration ingest (myotonometry, SWE, …)** | platform/datasets.js — generic ID-keyed dataset loader; public/datasets/shear-modulus-demo.json | not applicable to the loader; any real ingest would inherit the device’s own validation | A real exported series from a named device, with units, and a documented mapping from device site to anatomical ID. | `novel` | The *ingest path* exists and is validated: schema versioning, unit and field checks, alias resolution, unresolved IDs reported rather than dropped, round-trips through a saved project. The bundled dataset is labelled "synthetic demonstration set · not measured data" in its own source field. | A real ingest needs a site→ID mapping and a statement of what the device measures. The loader is ready; the calibration is not started. |
| 16 | **Rex zone / restriction hypothesis as a scientific claim** | expressed through the perturbation layer; no dedicated code path | none | Independent physiological outcomes measured in people, against a documented intervention protocol, with prespecified endpoints. Nothing in this repository is a step toward that. | `novel` | The product can show what a published-style receptor model predicts *if* mechanics change in an assumed way. That is the whole of it. The model was built to express these ideas, so it cannot also be their test. | Foundation measurement protocols first. Until those exist, in-sim results are illustrations of the hypothesis, not evidence for it — see the falsification note in VALIDATION_MATRIX.md. |

---

## The three findings worth reading twice

**The whole-body afferent path now has provenance — and the provenance is not
flattering.** `src/data/afferent_params.js` gives all 42 constants the
transduction model reads a unit, a meaning, a species field, a range where one
exists and a citation category, with `anatomy/info.js` reading from it instead
of holding literals. Writing that down forced a split that the bare literals had
hidden: **21 of 42 are `MODEL_TUNING`** — every `tau`, `threshold` and `phasic` —
chosen so each class behaves as its adaptation label describes, with no source,
and in `threshold`'s case no physical unit at all. The other 21 sit inside a
textbook-consensus band, where the *range* is the citable part and the point
value inside it is still a choice nobody sourced. The row moved
`speculative` → `partial` because the structure now exists; **verified is still
0**, and the tuning group cannot reach a source at all without a calibration
this product does not have.

**The perturbation model is the load-bearing assumption.** Every experiment
result depends on `transmission = 1/(1 + k_trans·m)` and a lag whose τ grows
with magnitude. Those three parameters carry the citation key
`REX_MODELLING_ASSUMPTION`, which says outright that no literature source
exists. Reusing the shape from the whole-body model means the two paths cannot
disagree about direction — that is internal consistency, and internal
consistency is not evidence.

**Nothing here is verified.** Every parameter record in
`src/data/micro/literature_params.js` carries `verified: false`, including the
one whose DOI is known. "The DOI is right" and "this constant is defensible"
are different claims and only the first has been checked.

---

## Falsification and support

This section exists because the distinction it draws is the one most likely to
be lost when results are shown to somebody in a hurry.

**What an in-sim experiment does.** It shows the **predicted** change in Layer B
outputs — firing rate, burst, plateau, dynamic index, spike count — given a
Rex-style mechanical perturbation applied under the selected receptor model.
That is a real and useful thing: it makes a hypothesis explicit enough to have
consequences, and it makes those consequences quantitative enough to argue with.

**What it does not do.** It does not support the human Rex hypothesis, and it
cannot falsify it. The model was built to express a set of mechanical ideas, so
running those ideas through it and observing the expected result is a statement
about the model's internal consistency, not about a body. Treating it as
evidence would be reasoning in a circle.

**What support or falsification would require.**

1. Foundation measurement protocols — a defined intervention, applied
   reproducibly, with the delivered mechanical change actually measured rather
   than assumed. That measurement is exactly what `k_trans` and `k_lag` stand in
   for today.
2. Independent physiological outcomes in people, prespecified, measured by
   something that is not this model.
3. A stated prediction, made before the measurement, that the hypothesis could
   have failed.

None of those exists in this repository, and none of them is a coding task.

**Saturation is a model limitation, not a result.** When the Basic drive is run
against the 3 mm Blum-shaped preset, 85 % of samples pin at the 300 spikes/s
ceiling, the dynamic index collapses to exactly 1.000, and every rate metric
reports a Δ of 0 % — the perturbation is real and completely invisible because
the clamp ate it. That finding says the gain and the amplitude were mismatched.
It says nothing whatsoever for or against any hypothesis, in either direction,
and a Δ of zero from a saturated run must never be read as "no effect".

**The sentence printed under every experiment result:**

> In-silico prediction under the selected model — not human data, and not
> evidence for or against any hypothesis.

---

## How to use this page

- Before making a claim about a module, find its row and read the status.
- `grounded` still does not license the word *validated*.
- If you want to move a row up, the *Validation target* column says what would
  have to be true. It is deliberately specific, and in several rows it is
  deliberately expensive.
- If you add a module, add a row. A module with no row is an unclassified claim.

## Related

- `METRICS.md` — definitions and formulas for the Level C composites
- `MICRO_MODE.md` — the receptor model, its equations, and an implemented-vs-missing table
- `SCENARIOS.md` — how to run the protocols and the baseline-vs-perturbation experiment
- `src/platform/layers.js` — the A/B/C taxonomy this matrix classifies against
