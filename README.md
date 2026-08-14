# CONTINUUM

**Living biotensegrity and afferent flow** — an interactive, multi-scale simulation of the body
as a single continuous tension network, from whole body down to individual mechanoreceptors.

A standalone freemium product on an extensible platform: a compact core engine, a fully selectable
living body, and every property, dataset and user artefact attached by permanent anatomical ID.
Self-contained — no backend, no assets to download, no external services. Every structure is
generated procedurally at load time.

```bash
npm install
npm run dev        # http://localhost:4180
npm run build      # → dist/
npm run preview
```

Requires a WebGL2 browser and Node ≥ 22.12 to build.

---

## What it is

The model treats the body the way the biotensegrity literature describes it: a pre-stressed
network of continuous tension elements with discontinuous compression elements floating inside
it. No bone is stacked on the one below it; nothing pivots on a fulcrum. The consequence — and
the thing the product exists to demonstrate — is that **a mechanical change anywhere is a
mechanical change everywhere**, and that the afferent information reaching the central nervous
system depends on the mechanical state of the tissue the signal had to travel through.

Three claims are modelled quantitatively enough to be watched happening:

**1. Continuity.** Load one end of a myofascial track and tension rises along its whole length,
attenuating with distance the way a real network does. Tensioning the left plantar fascia and
nothing else:

| plantar | calf | pelvis | lumbar | thoracic | cervical | cranium | whole network |
| --- | --- | --- | --- | --- | --- | --- | --- |
| +53 % | +8.8 % | +7.1 % | +12.1 % | +4.3 % | +1.0 % | +4.3 % | +15.9 % |

**2. Viscoelastic filtering.** Restriction is modelled as a loss of glide, which lengthens the
relaxation time constant of the tissue path — attenuating amplitude, adding phase lag and
narrowing bandwidth. Critically it does this *unevenly by receptor class*, because the classes
occupy different parts of the spectrum. Restricting the deep cervical fascia:

| class | firing (Hz) | fidelity | bandwidth |
| --- | --- | --- | --- |
| Pacinian | 30.6 → 0.6 | 1.00 → 0.04 | 1.00 → 0.10 |
| Meissner | 9.5 → 3.5 | 1.00 → 0.60 | 1.00 → 0.56 |
| Ruffini | 4.5 → 2.9 | 1.00 → 0.81 | 1.00 → 1.00 |
| Muscle spindle | 5.2 → 2.8 | 1.00 → 0.73 | 1.00 → 1.00 |
| Golgi tendon organ | 5.3 → 3.3 | 1.00 → 0.77 | 1.00 → 1.00 |
| Interoceptive | 3.1 → 2.6 | 1.00 → 0.76 | 1.00 → 1.00 |

Vibration sense is effectively abolished while slow tonic channels are largely preserved, and
21.8 ms of delay is added on top of normal conduction.

**3. Coupled physiology.** Compressing the diaphragm reduces achieved breathing excursion to 19 %
of commanded, and the rest of the system follows: intra-abdominal pressure 0.34 → 0.72, venous
return 0.93 → 0.42, lymph transport 0.72 → 0.28, overall signal integrity 0.99 → 0.78.

## Architecture

Two layers, deliberately separated.

**The core engine** is compact and permanent: a biotensegrity solver, the living physiology that
writes its rest state, and the afferent model that reads its output. One solve per frame publishes
node displacement and tension deviation into a 256×1 float texture; every tissue mesh is bound at
build time to its two nearest network nodes and reads that texture in its vertex shader. Breathing,
pulse, motility and applied load therefore move and colour all systems from a single source of
truth, with no per-mesh CPU work.

**The platform layer** attaches to that engine by anatomical ID and never touches geometry,
materials or the solver's inner loop.

```
                        ┌─────────────── platform (data, keyed by ID) ───────────────┐
                        │  properties · datasets · parameter sets · subject data     │
                        │  annotations · measurements · projects · entitlements      │
                        └───────────────────────────┬───────────────────────────────┘
                                                    │ anatomical ID
  network topology ──► tensegrity solver ──► field texture (256×1 float)
                              ▲                     │
         physiology ──────────┘                     ├──► every tissue shader
     (writes rest state)                            ├──► afferent model
                                                    └──► signal streams, telemetry
```

Every selectable structure has a permanent identifier derived from its semantic build key —
`BONE_FEMUR_L`, `MUSCLE_BICEPS_BRACHII_R`, `FASCIA_CERVICAL_DEEP`, `ORGAN_HEART` — plus one per
individual receptor ending, `RECEPTOR_PACINIAN_PLANTAR_L_01`. **1 740 IDs**: 271 structures and
1 469 individually addressable endings. IDs are derived rather than authored, so they cannot drift
when builders are reordered or geometry is retessellated, and a manifest hash detects it if they
ever do. Aliases mean external data need not match our spelling: `FASCIA_DEEP_CERVICAL` and
`ORGAN_DIAPHRAGM` resolve to the same structures as the canonical forms.

Because identity is the contract, everything downstream composes without engine changes:

- a **dataset** binds values to IDs and paints onto the model through one per-structure uniform
- a **parameter set** binds mechanical modifiers to IDs and applies them through the *existing*
  solver intervention path, so it inherits the verified mechanics rather than adding a second,
  unvalidated physics
- an **annotation** or **probe** anchors to an ID plus a local offset, so it tracks the tissue as the
  network deforms
- a **project** is a list of IDs plus state, which is why a scene saved today reloads against a
  future build, and why anything unresolvable is reported rather than silently dropped

| Module | Responsibility |
| --- | --- |
| `sim/tensegrity.js` | Node/cable/strut network, position-based dynamics, tension-only cables, resting-baseline calibration |
| `sim/physiology.js` | Cardiac and respiratory waveforms, rib kinematics, visceral motility, fluid transport |
| `sim/afferent.js` | Standard-linear-solid tissue filter, per-class transduction, rate coding, fidelity/latency/bandwidth |
| `anatomy/` | Procedural geometry for eight systems + receptor fields + receptor micro-anatomy |
| `gfx/` | Shared tissue shader, signal streams, network overlay, post pipeline |
| `core/` | State store, scale-aware orbit controls, multi-scale manager |
| `core/quality.js` | Tier table, hardware detection, adaptive quality controller |
| `platform/ids.js` | ID derivation, aliases, region classification, manifest signature |
| `platform/properties.js` | Base properties, live state, datasets, parameter sets, subject data, provenance |
| `platform/entitlements.js` | Capability model, tiers, mock licence resolver |
| `platform/projects.js` | ID-keyed scene capture and restore, JSON export/import |
| `tools/` | Measurement probes and annotations, both ID-anchored |
| `ui/` | Systems panel, inspector, workspace panels, telemetry, frame diagnostics, entitlement states |
| `ui/onboarding.js` | First-run coach marks: scale traversal, multi-select, free vs Professional |

### API surface

`window.CONTINUUM.api` is the same shape an embedding host would want, and is ID-addressed
throughout:

```js
CONTINUUM.api.manifest()                      // every ID, kind, layer, region
CONTINUUM.api.signature()                     // { count, hash } — identity drift check
CONTINUUM.api.get('FASCIA_CERVICAL_DEEP')     // base + live + bound data, with provenance
CONTINUUM.api.live('RECEPTOR_PACINIAN_PLANTAR_L_01')
CONTINUUM.api.registerDataset({ id, name, unit, values: { BONE_FEMUR_L: 12.4, … } })
CONTINUUM.api.registerPathology({ id, name, effects: { FASCIA_PLANTAR_L: { kind, magnitude } } })
CONTINUUM.api.setOverlay('innervation')
CONTINUUM.api.setTier('premium')
```

Dataset and parameter-set values may be keyed by ID, by alias, or by region code
(`THORAX`, `PLANTAR_L`, `CERVICAL`), which fans out to every structure in that region.

## Tiers

| | Explorer (free) | Professional |
| --- | --- | --- |
| Scales | body, region | all five, continuous, with progressive cutaway and receptor micro-anatomy |
| Layers | bone, muscle, organs, skin | every layer: superficial/deep/visceral fascia, myofascial lines, nerves, vessels, lymph, receptors |
| Selection | single | unlimited multi-select, isolate, hide, per-layer opacity |
| Intervention | — | tension, compression, restriction, shear |
| Visualisation | — | tension mapping, signal streams, tension-network overlay |
| Tools | — | distance/tension/signal probes, annotations |
| Data | — | research overlays, parameter sets, saved projects, JSON export |
| Physiology | heart rate, respiratory rate, pause | plus tone, motility, breath depth, time rate |
| Telemetry | network load, global tension, signal integrity, fidelity, afferent rate, breath excursion, fluid transport | plus L/R comparison, bandwidth, added latency, live viscoelastic parameters, per-receptor fidelity and latency, dataset values, afferent trace |

The gate is capability-based — features ask `can('scale.deep')`, never `if (tier === 'premium')` —
and enforced at the source of each capability, not in the interface. The scale manager clamps the
camera's minimum distance, so a free-tier user cannot reach a premium scale by wheel, pinch,
keyboard or by calling `goToTier` directly. `effectiveOpacity` returns zero for unlicensed layers,
which is the one function both the renderer and the raycaster go through, so a premium layer cannot
be revealed by scripting the store. The tools refuse scripted calls exactly as they refuse clicks.
Deleting the entire locked-state UI would not open a single gate.

The telemetry split is deliberate: the basic strip stays free because seeing the body actually
alive and globally responsive is what makes the locked instrument worth buying, and it reads from
the same solve either way. What is gated is the deep read-out — per-receptor bandwidth and latency,
the live viscoelastic parameters, cross-midline comparison, dataset values and the afferent trace.
Locked meters keep their label and their explanatory note rather than disappearing, so a user can
see what the instrument would tell them and click straight through to the plan.

Licensing is mocked for the prototype: a key in `localStorage`, any `PRO-XXXX` or `DEMO`. The
resolver is one module returning the shape a real entitlement service returns, so swapping it for a
signed token exchange touches no feature code.

### Design decisions worth knowing

- **Force colour is referenced to rest, not to the running peak.** The resting tension
  distribution is captured deterministically at start-up by settling the network with a fixed
  timestep, so a healthy body reads as its own tissue colours and only genuine change warms up.
  Peak-referenced colouring made everything read as loaded all the time.
- **Translucent layers accumulate rim-first.** A dozen double-sided shells overlap at any pixel;
  weighting each by fresnel means interiors are nearly free and only silhouettes register. It is
  order-independent, so no depth sorting is needed for twelve simultaneous systems.
- **The afferent filters substep to ~240 Hz.** A Pacinian corpuscle works from 40 to 400 Hz;
  sampling its input once per rendered frame aliases that band and reports the ending as silent.
  Substep count adapts to frame time so the physiology never depends on the frame rate.
- **Fidelity compares against a parallel healthy-tissue chain.** A rapidly adapting ending
  ignoring a static load is doing its job, not losing information; only the difference between the
  real path and an unrestricted one counts as loss.
- **Descending sections the view, and the section is soft.** From the organ tier inward the near
  plane advances toward the look-at point — you can look at a heart without first deleting the chest
  wall. Tissue approaching the plane fades instead of being clipped, and tissue well past the focal
  depth fades too, so the cut reads as a section rather than as missing geometry. Both terms lower
  alpha before the alpha-cut test, so sectioning removes fill rather than adding any.
- **The enclosure peels, then re-forms.** Bone, muscle and deep fascia play two roles at two scales,
  and one falling curve cannot serve both. Approaching the organ tier they are what you need to see
  past, so they thin hard, reaching their thinnest between the organ and tissue tiers — the zone you
  travel through rather than work in. Below that they come partly back, because a mechanoreceptor
  needs to be embedded in something to mean anything. Both failure modes were real: leaving them
  heavy made the organ tier a coloured wash with nothing to read a silhouette against, and taking
  them to zero left the tissue tier a field of glyphs floating in black.
- **Deep-tier framing resolves from the registry, not from coordinates.** At a twelve-millimetre span
  a centimetre of error is the whole frame. The tissue tier's default look-at point was a literal
  that sat just outside the anterior trunk — no structure within three centimetres, no receptor
  ending within twelve millimetres — so jumping to that tier showed black. It now resolves to a real
  structure's centre, preferring the scalene region: the densest tissue neighbourhood in the model,
  and where the deep cervical fascia demonstration takes place.

### Budget

271 selectable structures · 1 740 anatomical IDs · 166 network nodes · 469 elements · ~246 draw
calls and ~161 k triangles per frame · 13 shader programs · 238 geometries · 8 textures. One
~228 kB gzipped bundle including three.js, no runtime downloads. Over 20 s of continuous
simulation the network's resting load stays within 1 % of its calibrated baseline and maximum node
drift is 15 mm, so nothing creeps.

The platform layer adds no per-frame cost to the engine: overlays are written to a per-structure
uniform only when they change, measurement and annotation labels are DOM with one shared line
buffer each, and property bags are composed on demand.

## Performance

**The model is fragment-bound, not geometry-bound and not CPU-bound.** That single fact determines
every quality decision, so it is worth stating with numbers.

The whole simulation — one biotensegrity solve, the physiology, the afferent model with its 240 Hz
substepping, the scale manager, the signal streams, the measurement and annotation tools and the
property bags — costs **0.43 ms of CPU per frame**:

| solver | physiology | afferent | layer LOD | scales | signals | overlay | tools | properties |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.193 | 0.062 | 0.154 | 0.203\* | 0.007 | 0.004 | 0.105 | 0.009 | 0.028 |

\* only on a scale change, not every frame. Geometry is ~161 k triangles across ~246 draw calls,
which is nothing for any GPU of the last decade.

What costs is pixels. A dozen translucent layers overlap at every pixel of the figure, each
fragment runs a three-light rig, and the result is accumulated into a half-float MSAA target. So the
levers that matter are the ones that change how many samples get shaded and blended. Measured one
at a time from the same baseline (High, full render scale, 4× MSAA, two bloom levels, double-sided
shells, full density):

| lever | frame-cost saving |
| --- | --- |
| MSAA 4× → off | 48 % |
| render scale 1.0 → 0.5× | 43 % |
| render scale 1.0 → 0.75× | 21 % |
| bloom off | 9 % |
| translucent shells single-sided | 7 % |
| receptor endings 1 469 → 500 drawn | 7 % |
| signal beads 1 920 → 540 drawn | 5 % |
| MSAA 4× → 2× | 4 % |
| bloom two levels → one | 3 % |

Two further optimisations live in the shader and are *not* in that table, because they could not be
measured here. The first resolves a fragment's alpha before any lighting work and discards it if it
cannot contribute — expressed as a fraction of the layer's own opacity, so every layer is thinned by
the same proportion of its silhouette and dense or thin high-floor layers are never touched at all.
The second drops the specular term from the light rig at the lowest tier, which removes the
half-vector normalise and the `pow()` while keeping all three diffuse lights, and therefore the form
of the muscle bellies and organ surfaces.

Both measured within noise on the software rasteriser these figures come from, which does not reward
`discard` and appears to be bound by blend bandwidth rather than shader arithmetic. They are kept
because on real hardware a discarded fragment costs no blend and no bandwidth at all, and because
resolving alpha first is better shader ordering regardless — but no claim is made for their size, and
both are set conservatively enough that the image is the thing being protected rather than the
benchmark.

### Quality tiers

| | Low | Medium | High | Ultra |
| --- | --- | --- | --- | --- |
| Render scale | 0.50–0.90× | 0.62–1.0× | 0.85–1.5× | 1.0–2.0× |
| MSAA | off | 2× | 4× | 4× |
| Bloom | off | one level | two levels | two levels |
| Translucent shells | rim-weighted, single-sided | full, double-sided | full, double-sided | full, double-sided |
| Lighting | three-light rig, no specular | three-light rig | three-light rig | three-light rig |
| Receptor endings drawn | 500 | 882 | 1 469 | 1 469 |
| Signal beads drawn | 540 | 960 | 1 500 | 1 920 |
| Suits | integrated graphics, older laptops, software rendering | recent integrated graphics, mid-range laptops | discrete GPUs, Apple silicon | modern discrete GPUs, high-DPI displays |

Tension colouring, rim lighting, force propagation, the signal streams and the living physiology are
present at **every** tier. The tiers change how much is spent drawing the model; they never change
what is modelled, and no tier alters the solver, the afferent filters or the physiology by so much as
a timestep. Nothing about a tier is gated by licence either — a free-tier user on integrated
graphics gets the same adaptive behaviour as a Professional user on a workstation.

**Auto** is the default. It measures the real frame time and holds 60 fps by moving the render scale
first — the largest lever and the least visible one — and only changes tier once that band is
exhausted. Decisions require both sustained slowness (~0.6 s) and a minimum number of frames since
the last change, so the exponential average has actually caught up with the previous decision before
another is made; a machine at three frames a second would otherwise walk the entire ladder down in
one second while reacting to measurements that still described the old configuration. A tier that
has already proved too slow is retried far more reluctantly than it is left, which is what keeps a
machine sitting exactly on a boundary from oscillating.

Auto starts from a guess based on the reported GPU string, core count and device memory. Being wrong
costs a couple of seconds of adjustment — except for one decision that cannot be revisited, geometry
tessellation, which is CPU work done once at load. The frame diagnostics report which level was
built, and selecting a tier above it says so and suggests a reload.

**Frame diagnostics** — `Render ▸ Performance read-out`, or <kbd>Shift</kbd>+<kbd>F</kbd> — report
frame time, simulation CPU time, render scale, actual buffer size, draw calls, triangles, drawn
endings and beads, the active tier and what Auto last changed. `renderer.info` is read with
`autoReset` off and reset once per frame, so the numbers cover the whole frame rather than just the
final composite pass.

### Behaviour under stress

- **Resize** is coalesced to one call per frame. Each resize reallocates the MSAA target and four
  blur targets; doing that per event turns a dragged window edge into a multi-second stall.
- **Background tabs.** `requestAnimationFrame` stops, so the first frame back would otherwise carry
  the whole hidden interval as one timestep. The frame clock is reset on return and the quality
  controller is told to ignore it, so a session left in another tab for an hour resumes where it was
  rather than demoting itself over a frame that was never drawn.
- **Low frame rates.** The simulation timestep is clamped well below the frame time it is handed: at
  20 fps the model runs slightly slow rather than taking 50 ms steps the constraint solver cannot
  integrate stably. A visualisation that drifts a little in time is honest; one that detonates is
  not.
- **Camera transitions run on wall-clock time, not the simulation timestep.** A two-second
  cinematic descent takes two seconds whether the machine is drawing sixty frames a second or eight.
  Driving them from the clamped timestep made every transition run five times too long on slow
  hardware — precisely where an unfinished move reads as the application having hung.
- **Context loss** — a laptop waking from sleep, a driver reset — is caught and reported rather than
  leaving a silently frozen canvas.

## Scope

A visualisation and teaching instrument for mechanical and sensory physiology. Structures follow
published adult proportions; the mechanics, viscoelastic filtering and rate coding model
published principles qualitatively rather than reproducing any measured dataset. Figures shown in
the inspector are representative literature ranges.

It is not a diagnostic, clinical or treatment tool, and it does not describe any individual body.
