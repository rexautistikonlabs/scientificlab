# Microscope scenarios

How to run the stretch protocols in the UI and from the console, and what each
one is for.

A **scenario** imposes a length trajectory on the bound spindle instead of
reading the solved element length. That is the whole point: the living body is
never exactly the same stimulus twice, which is fine for watching and useless
for measuring. While a scenario runs, the rest of the model carries on
untouched — only the one ending is being driven.

Everything below is a **simplified educational demonstration**, inspired by
Blum KP et al. (2020) *eLife* 9:e55177, [doi:10.7554/eLife.55177](https://doi.org/10.7554/eLife.55177).
It is not a reproduction of that work, not validated against it, and no
quantitative agreement with its figures is claimed.

---

## Getting there

1. Accept the disclaimer.
2. Professional tier (`CONTINUUM.entitlements.redeem('DEMO')` in a dev build).
3. Descend past the Tissue tier, or press `Shift`+`M`.
4. Right panel → **Microscope** → set **Drive model** to **Extended**.

The scenario controls are in the same section. Scenarios run under either drive
model; Basic will simply show its own length-and-velocity response to the same
trajectory, which is a useful comparison in itself.

---

## The protocols

| id | name | amplitude | ramp | hold | for |
|---|---|---|---|---|---|
| `cervical` | Cervical ROI (product scale) | 0.25 mm | 300 ms | 1200 ms | what this ROI actually sees |
| `rampHold` | Ramp–hold–release | 2.0 mm | 400 ms | 1500 ms | the classic shape |
| `history` | History pair | 2.0 mm ×2 | 300 ms | 600 ms | history dependence |
| `fastSlow` | Fast vs slow ramp | 2.0 mm | 120 ms | 1200 ms | yank sensitivity |

Amplitudes are **educational values**, chosen so the effects are visible without
pinning the rate at its ceiling. They are not taken from any paper.

---

## Scenario 1 — Blum-like ramp–hold–release

**In the UI:** Drive model **Extended** → Scenario **Ramp–hold–release**.

Watch the read-out: `tension` rises through the ramp, `yank` spikes at the onset
and falls back to near zero during the hold, `availability` drops as the tissue
moves and recovers during the hold, and `Ia rate` bursts then settles to a
plateau.

**From the console**, at full temporal resolution:

```js
const spec = CONTINUUM.micro.protocols().find(p => p.id === 'rampHold');
const tr   = CONTINUUM.micro.simulate(spec, { settle: 15 });
Math.max(...tr.rate)          // early burst
tr.rate[tr.t.findIndex(t => t > 1.4)]   // plateau
```

Measured with the shipped defaults: burst **136 Hz**, plateau **57 Hz** — a
dynamic index of about 2.4.

---

## Scenario 2 — History pair

This is the one worth running first, because it is the effect the Basic model
cannot produce at all.

**In the UI:** Scenario **History pair**. Two identical stretches, 0.5 s apart.
The second burst is visibly smaller.

**From the console**, sweeping the gap:

```js
const base = CONTINUUM.micro.protocols().find(p => p.id === 'history');
for (const gapS of [0.5, 1, 2, 5, 10, 20]) {
  const spec = { ...base, gapS };
  const tr   = CONTINUUM.micro.simulate(spec, { settle: 15 });
  const [p1, p2] = CONTINUUM.micro.peaks(spec, tr);
  console.log(gapS, (p2 / p1).toFixed(3));
}
```

Measured with the shipped defaults (τ_rec = 4 s):

| gap | peak 1 | peak 2 | ratio |
|---|---|---|---|
| 0.5 s | 151.6 | 86.7 | **0.57** |
| 1 s | 151.6 | 96.5 | 0.64 |
| 2 s | 151.6 | 111.6 | 0.74 |
| 5 s | 151.6 | 135.6 | 0.89 |
| 10 s | 151.6 | 149.0 | **0.98** |
| 20 s | 151.6 | 153.7 | 1.01 |

Recovery is monotone in the gap, which is the claim: a stretch soon after
another finds fewer cross-bridges available, and waiting restores them.

To watch the mechanism rather than the outcome, plot `tr.availability` — it
collapses during the first stretch and climbs back through the gap.

---

## Scenario 3 — Fast vs slow ramp

Same distance, different speed. Only a drive that sees yank can tell them apart.

```js
const base = CONTINUUM.micro.protocols().find(p => p.id === 'rampHold');
for (const rampMs of [1000, 400, 200, 120]) {
  const tr = CONTINUUM.micro.simulate({ ...base, rampMs }, { settle: 15 });
  const end = rampMs / 1000 + 0.05;
  const early = Math.max(...tr.rate.filter((_, i) => tr.t[i] <= end));
  console.log(rampMs, early.toFixed(1));
}
```

Measured: **98 → 136 → 176 → 208 Hz** as the ramp goes from 2 to 16.7 mm/s,
while the plateau stays within **1 %** across all four. The stretch you end up
holding is the same; the way you got there is not.

---

## Scenario 4 — Fusimotor drive

Two sliders, both defaulting to off. They affect the Extended model only.

- **Static γ-like** raises baseline discharge and the sustained response.
- **Dynamic γ-like** raises the response to how fast a stretch arrives.

Measured at full drive on the 2 mm, 300 ms ramp:

| drive | quiet baseline | ramp burst | plateau |
|---|---|---|---|
| none | 34 Hz | 152 Hz | 57 Hz |
| static γ = 1 | **57 Hz** | 164 Hz | **97 Hz** |
| dynamic γ = 1 | 34 Hz | **292 Hz** | 69 Hz |

Static drive lifts the plateau by 40 Hz and the burst by 13; dynamic drive lifts
the burst by 141 and the plateau by 12. That separation is the point of having
two channels, and it is why the dynamic channel's effect on short-range
stiffness is deliberately at half the weight of its effect on yank sensitivity —
at full weight "dynamic" drive lifted the plateau almost as much as static drive
did, erasing the distinction.

Note that dynamic γ = 1 on a fast ramp does reach the rate ceiling. That is the
extreme corner of both sliders at once; the defaults are zero.

---

## Reading the numbers honestly

**Playback runs in simulation time, not wall clock.** The model's clock is the
clamped simulation timestep, so on a slow machine a 2.3 s protocol takes longer
than 2.3 s to watch. This is the same choice the rest of the engine makes and it
is the right one — the alternative is a stimulus whose speed depends on the
graphics card.

**The panel samples once per frame.** A 50 ms burst can fall between two frames
on a slow machine, so the `Ia rate` row may under-report a peak that the spike
train nonetheless contains. The spike raster and the spike count are integrated
at 1 ms and do not have this problem; `CONTINUUM.micro.simulate()` runs at full
resolution and is what the measurements above use.

**Tension is in arbitrary units.** It is a proxy, not newtons. Only ratios and
directions mean anything.

**Cross-check.** Running `rampHold` on the live unit and comparing against
`simulate()` of the same protocol agrees on spike count to about 4 %, the
residual being the coarser substep the live path uses at low frame rate.

---

## Saturation, and why the Extended gains are lower

At the Basic model's length gain of 200 spikes/s per mm, a 3 mm stretch computes
to 650 spikes/s and is clamped to the 300 Hz ceiling for the entire stretch. The
dynamic response disappears into the clamp and every measurement becomes a
measurement of the clamp.

That gain is right for this ROI, whose real excursion is a fraction of a
millimetre. It is wrong for a multi-millimetre teaching scenario. So the
Extended model's gains are set an order of magnitude lower, and at 3 mm it
reports a 176 Hz burst over a 60 Hz plateau — inside the working range, with the
dynamic response intact.

Which is the actual lesson: **the amplitude and the gain have to be chosen
together.** Running a literature-scale protocol against product-scale gains
produces a flat line at the ceiling and tells you nothing.

---

## Console reference

```js
CONTINUUM.micro.setModel('extended' | 'basic')
CONTINUUM.micro.setGamma('static' | 'dynamic', 0..1)
CONTINUUM.micro.protocols()            // the preset list
CONTINUUM.micro.runScenario(id | null) // drive the live unit; null returns to body length
CONTINUUM.micro.simulate(specOrId, { dt, settle, gamma })   // offline trace
CONTINUUM.micro.peaks(specOrId, trace)                       // peak per repetition
CONTINUUM.micro.newDrive()             // a bare ExtendedDrive, for stepping by hand
CONTINUUM.micro.readout()              // live numbers, unamplified
CONTINUUM.micro.citation()             // the Blum et al. reference record
```
