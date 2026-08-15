# Metrics, and what kind of claim each one carries

Every number this product displays belongs to one of three layers. The layer is
shown as a tag next to the number and the definition is in its tooltip; both
read from `src/platform/layers.js`, which is the single source of truth.

| | | |
|---|---|---|
| **A** | Mechanical proxy | Computed by the solver or derived directly from it. Proxies in stated units — nothing here was measured in tissue. |
| **B** | Literature-style model | The receptor path: rate, spikes, adaptation, conduction, history. Simplified and educational, structured after published work. |
| **C** | Composite summary | Aggregates several quantities into one number for the instrument strip. A summary visualisation, not a primary scientific output. |

The whole telemetry strip is Layer C. That is the point of tagging it: a bar
labelled *Signal integrity* invites being read as a measurement, and it is a
weighted product of three modelled quantities with exponents somebody chose.

---

## Layer A — mechanical proxies

| output | unit | definition |
|---|---|---|
| Element length | mm | Live length of the bound network element, from the solver. |
| ΔL | mm | Length minus the settled resting length of the same element. |
| Strain | % | ΔL / L₀, where L₀ is the settled resting length in the standing body. |
| dL/dt | mm/s | Length differenced over the frame. |
| Intrafusal tension proxy | arbitrary | `k_pe·[x]₊ + k_srs·a·s`. **Not newtons.** Only ratios and directions mean anything. |
| Yank | arbitrary/s | d(tension)/dt, low-passed. Same arbitrary units per second. |
| Cross-bridge availability | % | Modelled fraction of short-range bonds attached. Recovers in time, breaks down with distance travelled. |

---

## Layer B — the receptor model

| output | unit | definition |
|---|---|---|
| Ia firing rate | spikes/s | Output of the selected drive model, clamped to r_max. |
| Spike times | s | Exact integrate-and-fire on the modelled rate. Deterministic — same input, same times. |
| Adaptation | 0–1 | Slow decay of the static term while a stretch is held (Basic model). |
| Conduction delay | ms | `ℓ/v_c + t_syn`, from the parameter table. |
| Second-stretch ratio | × | Peak rate of the second identical stretch ÷ the first (Extended model). |
| Dynamic index | × | Peak rate during the ramp ÷ the held plateau rate. |

This is the serious surface. It is still a model output, not a recording, and
`MICRO_MODE.md` lists what it does and does not represent.

---

> Every metric family below is classified in `VALIDATION_MATRIX.md`. The Level C
> composites are `speculative` there — real arithmetic over real state, with no
> external anchor for the weightings. That is not a criticism of them; it is what
> a composite is.

The per-class constants these composites are built from — `bestHz`, `tau`,
`threshold`, `phasic`, `cvNum` — carry their provenance in
`src/data/afferent_params.js`, and half of them are explicitly model tuning
rather than sourced values. `AFFERENT_PARAMS.md` has the breakdown.

## Layer C — composite summaries

Each of these is real arithmetic over real state. Each also compresses something
multi-dimensional into one bar, which is why it is labelled rather than
presented as a measurement.

### Network load
```
load% = RMS(tension over all 469 elements) / RMS(same, at the calibrated resting state) × 100
```
100 % means the network sits at its resting pre-tension. Computed in
`sim/tensegrity.js`; the resting RMS is captured once during `settle()`.

### Peak rise
```
peak% = max over elements of (T_i − baseline_i) / max(0.55·baseline_i, 0.012), clamped to [−1, 1.6]
```
**One element out of 469 sets this number.** It answers "how bad is the worst
spot", not "how loaded is the body".

### L/R asymmetry
```
asym = (ΣT_left − ΣT_right) / (ΣT_left + ΣT_right)
```
over elements whose home position is off the midline. A whole-body imbalance
compressed to one signed number.

### Signal integrity
```
integrity = fidelity^0.5 × bandwidth^0.3 × timing^0.2
timing    = clamp(1 − addedLatency / 90 ms, 0, 1)
```
averaged over the seven receptor classes, weighted by `0.35 + rateNorm` — how
much traffic each class is generating. **The exponents are a chosen weighting,
not a measured one.** They encode a judgement that amplitude matters more than
bandwidth, which matters more than timing. That judgement is defensible and it
is not a measurement, so this is a summary.

### Fidelity
```
fidelity = drive / idealDrive        (per class, clamped to [0,1])
```
The amplitude that survived the tissue filter divided by the amplitude that
would have arrived through healthy tissue. Averaged across classes weighted by
firing.

### Added latency
```
addedLatency = groupDelay(current tissue path) − groupDelay(healthy baseline)
```
Group delay of a first-order lag at the frequency each class works in, plus a
conduction term. Milliseconds.

### Bandwidth
```
bandwidth = (1 / (2π·τ)) / bestHz        (per class, clamped to [0,1])
```
The −3 dB corner of the transmission path divided by the highest frequency the
class is built to resolve.

### Afferent rate
Sum of modelled firing across all seven populations. **A population total, not
one ending** — it is not comparable with the Microscope panel's Ia rate, which
is a single modelled afferent.

### Breath excursion, Fluid transport
Achieved diaphragm travel ÷ commanded travel; and a composite of modelled venous
return and lymph flow.

---

## The perturbation layer

A mechanical intervention is assumed to reach the receptor in two ways, both
parameterised in `src/data/micro/literature_params.js` and both carrying the
citation key `REX_MODELLING_ASSUMPTION` — **this product's own assumption, with
no literature source and nothing measured**:

```
transmission = 1 / (1 + k_trans · m)        x' = x · transmission
tau          = tau_0 · (1 + k_lag · m)      first-order lag on x'
```

for intervention magnitude `m`. Both shapes are lifted from the whole-body
afferent model, which already treats restriction as a loss of glide that
lengthens the tissue relaxation time constant. Reusing the shape means the micro
path and the telemetry path cannot disagree about the direction of an effect.
Inventing a second one would let them.

A release uses the same terms with the sign reversed and **capped**: it restores
glide toward healthy tissue and stops there. Letting it run past 100 %
transmission would be claiming that intervention makes tissue transmit better
than tissue does, which is not a claim this product makes.

---

## What a perturbation result means

> In-silico prediction under the selected model — not human data, and not
> evidence for or against any hypothesis.

That sentence is in `layers.js` as `EXPERIMENT_CAPTION` and appears under every
experiment result. The reasoning behind it:

**The model was built to express a set of mechanical ideas, so it cannot also be
their test.** Running a restriction through it and observing that afferent
output falls is a statement about the model's internal consistency, not evidence
about a body. Anything else would be circular.

The phrasing this product uses:

> Under this published-style receptor model, changing these mechanical
> parameters produces this predicted change in afferent behaviour.

Language that is **not** used anywhere: *proves*, *validates the hypothesis*,
*diagnostic*, *matches published data*, or any percentage presented as a
prediction-fidelity or validation score. There is no scored comparison against
any published series, because this product holds no published series to compare
against. A "Benchmark" label here would mean *protocol presets*, nothing more —
which is why the presets are called protocols and not benchmarks.

---

## Rules for adding a metric

1. Put it in `OUTPUTS` in `src/platform/layers.js` with a layer and a definition.
2. If the definition needs a formula to be honest, write the formula.
3. If it cannot be defined in one line, it is Layer C and says so.
4. Never retune a weighting so the visualisation looks better. If a composite
   reads wrong, either the underlying model is wrong or the composite is the
   wrong summary — both are real problems and neither is fixed by exponents.
