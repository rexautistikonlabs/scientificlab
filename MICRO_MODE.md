# Microscope mode — micro-mechanics of one receptor

Microscope mode takes a single mechanoreceptor and drives it from the same
solve that moves the rest of the body. Its priority is **motion and timing that
follow a dynamical model with published parameter ranges** — not a picture that
resembles a slide.

---

## What is and is not claimed

**Claimed.** The deformation of the drawn receptor, the firing rate of its
afferent, the times of individual spikes and the conduction delay to the first
central synapse are all computed from a mechanical simulation using parameters
taken from published ranges. Nothing in the animation is hand-timed. Change the
mechanics and the timing changes with it, in the direction the equations dictate.

**Not claimed.** This is not an image of a real spindle. It is not histological
photography, not electron microscopy, not a patient recording, and not
diagnostic. It is not a validated model of any individual. The visual style is
schematic on purpose: a fusiform capsule, four intrafusal fibres, an
annulospiral ending and one afferent axon, drawn clearly rather than
realistically. Two display quantities are deliberately exaggerated so the
motion is visible at all, and both are labelled where they appear — see
[Display exaggeration](#display-exaggeration).

The caption is fixed on screen for as long as the mode is active:

> Literature-constrained schematic simulation of receptor mechanics and afferent
> timing. Not histological photography, not patient data, not diagnostic.

The parameter citations in `src/data/micro/literature_params.js` **have not been
verified against primary sources.** Every `citation` block carries
`verified: false`, and `doi`/`pmid` are `null` rather than guessed. A human must
check each value against the paper before any of this supports a published
claim. `citationsVerified()` reports the current state.

---

## The region of interest

**Deep dorsal neck, C1–C3** — the suboccipital-adjacent cable, reported as
`MUSCLE_SPLENIUS_L`.

This was chosen by measurement, not preference. Sampling peak-to-peak length
swing for every element in the network over 14 s of running physiology:

| candidate | node pair | rest length | swing | fractional |
|---|---|---|---|---|
| **deep dorsal neck** | `vert:C1` → `vert:C3` | 41.1 mm | 0.496 mm | **1.208 %** |
| cranium strut | `skull:base` → `vert:C1` | 10.2 mm | 0.143 mm | 1.397 % |
| scalene | `skull:mastoid:L` → `rib:1:lat:L` | 181.5 mm | 1.393 mm | 0.767 % |

The dorsal neck cable wins among the muscle-like elements because a spindle
encodes *fractional* length change, not millimetres — scalene has nearly three
times the absolute excursion and little more than half the strain. The cranium
entry is a strut, not a muscle, so it is not a candidate.

A second ROI, **scalene** (`vert:C4` → `rib:2:lat:L`), is selectable from the
Microscope panel. Switching rebuilds the unit rather than mutating it, so
adaptation state, emission phase and spike history all start clean; carrying
them across would mean the first spikes after a switch described the previous
muscle.

If a node pair stops existing, `findElement` returns −1 and the unit reports
itself unresolved. It never silently binds to a different element.

---

## Pipeline

Fixed timestep throughout. `SPIKE_DT = 1 ms`, up to 64 substeps per frame, so
spike times are a property of the model rather than of the frame rate: the same
stretch produces the same spikes at 15 fps and at 144 fps.

### 1. Kinematics — `src/sim/spindle.js`

`L(t)` is read directly from `solver.eLen[element]`, the live length in metres
written by the constraint solver. There is no second physics.

```
ΔL(t) = L(t) − L₀
ε(t)  = ΔL(t) / L₀
v(t)  = dL/dt, differenced over the frame
```

`L₀` is the **settled** length of the element in the standing body, sampled once
after `solver.settle()` — *not* `erest0`, the network's construction rest length.
This distinction is not cosmetic. `erest0` is a geometric parameter; a spindle's
baseline discharge is defined at the muscle's in-situ resting length, which is
where the pre-stressed network actually comes to rest. The two differ by about
3.7 % for the cervical cables (41.08 mm vs 39.63 mm), and against a length gain
expressed in spikes per millimetre that difference drives the modelled afferent
to silence at rest — the one thing a primary ending demonstrably does not do.
Both figures appear in the read-out (`restLengthMm`, `anatomicalRestMm`).

The length is sampled once per frame, because that is how often the solver
produces a new one, and interpolated linearly across the substeps between
samples.

### 2. Receptor drive — primary (Ia) ending

Prochazka-style structure, static term plus a fractional-power velocity term:

```
r(t) = r₀ + k_v · [v]₊^p + k_L · a(t) · ΔL
```

clamped to `[0, r_max]`.

- `[v]₊` is **lengthening velocity only** — shortening does not drive the
  primary ending. This asymmetry, together with the fractional exponent `p`, is
  what produces the classic behaviour: a burst on stretch, near silence on
  release.
- `a(t)` is slow adaptation of the **static term only**. Velocity sensitivity
  does not adapt.

Adaptation relaxes toward a floor while a stretch is held and recovers toward 1
when the muscle returns to reference:

```
target = (ΔL > 0) ? a_∞ : 1
a ← a + (target − a)·(1 − e^(−dt/τ_adapt))
```

Measured: held at +0.5 mm, `a` runs 1 → 0.716 → 0.611 → 0.572 → 0.558 → 0.553
over 3 s; released, it recovers to 0.997 in 3 s.

### 3. Spike generation — exact integrate-and-fire

Phase accumulates at `r·h` and emits on every unit crossing:

```
p₀ = phase;  phase = p₀ + r·h
while phase ≥ 1:
    phase −= 1
    t_spike = t + h · (m − p₀)/(r·h)      # m-th crossing this substep
```

The crossing instant is **solved for inside the substep**, not rounded to its
end. Rounding snapped every spike to the 1 ms grid, so the interval between
spikes alternated between neighbouring milliseconds — a few percent of jitter
that was an artefact of the integrator, not a property of the receptor, and that
was visible in both the raster and the drawn pulse spacing.

With the crossing solved, a constant drive gives an interval of exactly `1/r`:

| ΔL | r | mean ISI | expected `1/r` | sd | CV |
|---|---|---|---|---|---|
| 0.1 mm | 70.0 Hz | 14.2857 ms | 14.2857 ms | 0 | 0 |
| 0.3 mm | 110.0 Hz | 9.0909 ms | 9.0909 ms | 0 | 0 |
| 0.6 mm | 170.0 Hz | 5.8824 ms | 5.8824 ms | 0 | 0 |

Nothing here is random. The same mechanical input always produces the same
spike times; two runs of the same trajectory are bit-identical.

A rate of zero produces silence rather than a stalled phase.

### 4. Conduction

Each spike is stamped with an arrival time:

```
t_arrive = t_emit + ℓ/v_c + t_syn
```

Both `ℓ` and `v_c` are adjustable from the Microscope panel within their
published ranges, and the delay in the read-out follows immediately:

| ℓ | v_c | delay |
|---|---|---|
| 0.12 m | 90 m/s | 2.03 ms |
| 0.22 m | 90 m/s | 3.14 ms |
| 0.35 m | 90 m/s | 4.59 ms |
| 0.22 m | 72 m/s | 3.76 ms |
| 0.22 m | 120 m/s | 2.53 ms |

### 5. Visuals

**Capsule.** The spindle group's axial scale is driven by the simulated strain of
the host element — a spindle lies in parallel with the extrafusal fibres, so its
length follows the muscle's, which is the whole mechanical premise of the
receptor. Transverse axes shrink as `1/√(axial)`, conserving volume to first
order; measured product `scale.y · scale.x²` = 1.0000. A capsule that lengthened
without thinning would be showing something that does not happen.

**Pulses.** Drawn positions come from `spindle.inFlight()`, which returns each
in-transit spike's normalised progress along the axon computed from its own
emission time and the current delay. Pulses are phase-locked to the spike
generator by construction; there is no independent animation clock. When the
quality tier caps how many may be drawn, the survivors are taken by an even
stride over the sorted positions rather than the first N found in the ring —
filling in ring order handed the renderer a clump whose bunching reflected where
the write head happened to be.

**Raster.** One tick per spike over the last second, positions taken from the
model's own spike times.

---

## Display exaggeration

Two quantities are scaled for display. Both are stated where they appear, and
neither touches the model.

| what | factor | why |
|---|---|---|
| capsule axial strain | ×18 | the real excursion is a few tenths of a percent — correct and invisible |
| pulse flight along the axon | ×120 | a 3 ms conduction delay is a fraction of one frame; the pulse would exist, be correct, and never be seen |

The strain and rate figures in the read-out are **never** amplified. The delay
row shows the true delay in milliseconds, and the row beneath it says
`drawn ×120 slower`. Time dilation scales only the mapping from elapsed time to
position along the axon, so the *ratio* of two delays survives: doubling the path
length still doubles the visible flight.

Verified — with the drive held near 50 Hz, the number of pulses in transit tracks
`r · delay · 120` across every condition:

| condition | delay | rate | pulses in flight | `r·d·120` |
|---|---|---|---|---|
| ℓ = 0.12 m | 2.03 ms | 55.6 Hz | 13.50 | 13.54 |
| v_c = 120 m/s | 2.53 ms | 55.0 Hz | 16.33 | 16.70 |
| default | 3.14 ms | 54.8 Hz | 20.43 | 20.65 |
| v_c = 72 m/s | 3.76 ms | 53.5 Hz | 24.83 | 24.14 |
| ℓ = 0.35 m | 4.59 ms | 55.3 Hz | 30.17 | 30.46 |

---

## Entering and leaving the mode

Microscope mode latches on the continuous scale position with **hysteresis** —
enter at `t > 3.10`, leave at `t < 2.85`. The asymmetry is the point: a single
threshold under a slowly orbiting camera toggles the caption, the read-out and
the framing several times a second. Inside the band the mode holds whatever
state it already had.

`Shift`+`M` pins the mode, which overrides distance entirely. A pin releases
only on an explicit toggle or by pulling back well past the exit threshold.

On the transition in, the camera **widens to frame the ROI** if it is closer than
`extent × 1.75`. Arriving at the Receptor tier (900 µm) put the camera inside the
annulospiral coil of a 6.4 mm subject — a fine place to look around and a useless
place to arrive, given that the mode claims to focus one ROI. Framing only ever
widens, and only on entry; zooming further in afterwards is left alone.

**Steady** (on by default) damps gross body displacement in the shaders so a
millimetre-scale subject holds still. This is display-only — the solve, the
length the spindle reads, and every number in the read-out are untouched.

Microscope mode sits past the Tissue tier, so it is behind the `scale.deep`
capability like every other deep-scale feature. Verified: on the free tier the
mode cannot be reached by the pin, by writing `store.micro.active` directly, by
zooming, or by a tier jump — the scale ceiling defeats all four.

---

## Parameters

All in `src/data/micro/literature_params.js`. **Animation code must not contain
constants of its own** — if a value is not in this table, it is not a parameter,
it is a bug. `P(id)` throws on an unknown key rather than returning `undefined`.

| id | symbol | default | range | unit | species | citation key |
|---|---|---|---|---|---|---|
| `spindleLength` | L_spindle | 6.0 | 3.0–10.0 | mm | human | `boyd1976` |
| `equatorFraction` | f_eq | 0.3 | 0.2–0.4 | — | human | `hunt1990` |
| `iaRateBias` | r₀ | 50 | 0–100 | spikes/s | cat (fitted) | `prochazka1999` |
| `iaVelocityGain` | k_v | 65 | 30–100 | spikes/s per (mm/s)^0.5 | cat (fitted) | `prochazka1999` |
| `iaVelocityExponent` | p | 0.5 | 0.3–0.7 | — | cat (fitted) | `prochazka1998` |
| `iaLengthGain` | k_L | 200 | 50–300 | spikes/s per mm | cat (fitted) | `prochazka1999` |
| `iaMaxRate` | r_max | 300 | 150–500 | spikes/s | human / cat | `matthews1972` |
| `iaAdaptationTau` | τ_adapt | 0.6 | 0.2–2.0 | s | cat / human | `hunt1990` |
| `iaAdaptationFloor` | a_∞ | 0.55 | 0.3–0.9 | — | cat / human | `hunt1990` |
| `iaConductionVelocity` | v_c | 90 | 72–120 | m/s | human | `burke_gandevia` |
| `iaPathLength` | ℓ | 0.22 | 0.12–0.35 | m | human | `NEEDS_PRIMARY_SOURCE` |
| `synapticDelay` | t_syn | 0.0007 | 0.0003–0.0012 | s | mammalian | `NEEDS_PRIMARY_SOURCE` |
| `suboccipitalSpindleDensity` | ρ_spindle | 98 | 40–250 | spindles/g | human | `voss1971` |

`suboccipitalSpindleDensity` is documentation-only — nothing reads it. It is
recorded because it is the reason this ROI is interesting, and it carries a
`VERIFY THIS NUMBER` note.

### Known limits

- **`k_L` is the weakest link.** The coefficient comes from a model fitted to cat
  medial gastrocnemius over stretches of several millimetres. The excursions here
  are sub-millimetre, so the length term is *illustrative rather than
  predictive* in this regime. This is flagged in the parameter's own notes.
- **Species mixing.** The rate model's coefficients are cat-derived and applied
  to human geometry. Conduction velocity and path length are human.
- **One unit, not a population.** A real muscle has tens to hundreds of spindles
  with distributed thresholds and fusimotor drive. This is one, with no
  gamma-motor input — so it cannot show the alpha-gamma co-activation that keeps
  a real spindle loaded during shortening.
- **No Ia–Ib or Ia–II interaction**, no central integration past the first
  synapse.
- **Frame-rate-limited length sampling.** Length is known only at frame
  boundaries and interpolated between them; a stretch faster than the frame
  interval is smoothed.

---

## How to tune

**From the UI.** The Microscope panel (Professional tier) exposes conduction
velocity and path length as sliders mapped across the published range, plus the
ROI selector and the steady toggle.

**From the console.**

```js
CONTINUUM.micro.params()                       // the whole table
CONTINUUM.micro.param('iaLengthGain')          // one value
CONTINUUM.micro.setParam('iaConductionVelocity', 75)   // clamped to the range
CONTINUUM.micro.readout()                      // every live number, unamplified
CONTINUUM.micro.spikes(1)                      // spike times, last second
CONTINUUM.micro.spindle                        // the unit itself
```

`setParam` clamps to `[min, max]`. To go outside a published range you must edit
the table, which is the intended friction.

**Adding a parameter.** Add a record with all nine fields — `id`, `symbol`,
`value`, `min`, `max`, `unit`, `species`, `notes`, `citation` — then read it with
`P('yourId')`. A missing citation should be `cite('NEEDS_PRIMARY_SOURCE', …)`
rather than a plausible-looking reference.

**Adding a receptor.** `MICRO_ROIS` in `src/sim/spindle.js` maps a region key to
a node pair and a host structure ID. A Golgi or Pacinian unit would follow the
same four stages with its own drive function; the spike generator, the conduction
stage and the pulse renderer are receptor-agnostic and can be reused as they are.

---

## Performance

One spindle and one afferent path. Per frame that is one element length read,
one rate evaluation, an adaptation step and a phase accumulator — negligible
against a 469-element solve.

The quality tier scales how many in-flight pulses are **drawn**, via
`MicroPulses.setDensity()`, and nothing else. Verified: at the low tier, 9 of 29
in-flight pulses were drawn while the rate held at 55 Hz — a sparser axon with
identical timing. `MAX_MICRO_PULSES = 32`.

---

## Verification

`node --check` on every touched file, `npm run build`, then in a headless
browser:

- **Direction.** Sweeping the imposed rest length with the breath stilled, firing
  rate rises monotonically with the length the solver actually produced: 10.7 Hz
  at ΔL = −0.224 mm through 55.0 Hz at ΔL = +0.007 mm. Adaptation falls to 0.57
  at the stretched end, correctly flattening the top of the curve.
- **Geometry.** Axial scale rises monotonically with strain; volume product
  1.0000.
- **Timing.** Spike times strictly increasing, zero duplicates. Mean reported
  rate 48.41 Hz against 48.57 Hz actually emitted. Constant-drive CV = 0 offline.
- **Delay.** Pulses in transit track `r · delay · 120` within ~4 % across five
  conditions; both path length and conduction velocity move it.
- **Rendered pulses.** Draw range 13 at ℓ = 0.12 m against 30 at ℓ = 0.35 m.
- **Gating.** Free tier cannot reach the mode by any of four routes.
- **No regressions.** Deterministic physics output byte-identical to the previous
  build (the only lines that differ are breath-phase-dependent samples, which
  differ identically between two runs of the *same* build). Manifest 1740 IDs,
  signature `238ca549`. Telemetry split, overlay gates, project round-trip and
  dataset validation all unchanged. Zero console errors.
- **Copy.** No organisational branding, no claim of visual equivalence to real
  microscopy, no affirmative clinical claim anywhere in the UI text.

---

## Out of scope in this version

Full-body micro detail; Pacinian and Golgi mechanical packs (the hooks exist —
`MICRO_ROIS` and the receptor-agnostic downstream stages — but no drive
functions); photoreal textures or EM-derived meshes; any change to backend,
billing or auth.
