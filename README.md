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
| `sim/spindle.js` | One muscle spindle bound to a network element: kinematics, drive, exact integrate-and-fire, conduction |
| `sim/spindle_extended.js` | Optional Extended drive: history, tension/yank, fusimotor, scenario protocols. See `MICRO_MODE.md` |
| `anatomy/` | Procedural geometry for eight systems + receptor fields + receptor micro-anatomy |
| `gfx/` | Shared tissue shader, signal streams, network overlay, post pipeline |
| `core/` | State store, scale-aware orbit controls, multi-scale manager |
| `core/quality.js` | Tier table, hardware detection, adaptive quality controller |
| `platform/layers.js` | The A/B/C layer taxonomy and every output's definition — the source of truth for `METRICS.md` |
| `data/afferent_params.js` | Provenance for the 42 whole-body afferent constants: unit, meaning, range, species, citation category. See `AFFERENT_PARAMS.md` |
| `sim/experiment.js` | Controlled experiments: baseline vs perturbed, same protocol; the perturbation model |
| `platform/ids.js` | ID derivation, aliases, region classification, manifest signature |
| `platform/properties.js` | Base properties, live state, datasets, parameter sets, subject data, provenance |
| `platform/entitlements.js` | Capability model, tiers, entitlement claims — the one seam a real licence service replaces |
| `platform/auth.js` | Mock account and subscription; resolves a session into a claim |
| `platform/datasets.js` | Research overlay format, validation, bundled dataset loading |
| `platform/projects.js` | ID-keyed scene capture and restore, JSON export/import |
| `tools/` | Measurement probes and annotations, both ID-anchored |
| `ui/` | Systems panel, inspector, workspace panels, telemetry, frame diagnostics, entitlement states |
| `ui/tour.js` | Ten-step guided tour: spotlit coach marks over real UI, run once after the disclaimer. See `TOUR.md` |

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

Both licensing paths are mocked for the prototype — an account with a subscription, or a licence key
(`PRO-XXXX`, or `DEMO`) for offline and institutional seats. Both resolve to the same entitlement
claim, which is the only thing that can change what is unlocked. See **Accounts and entitlement**
below for the production substitution.

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
calls and ~161 k triangles per frame · 13 shader programs · 241 geometries · 6 textures. One
~236 kB gzipped bundle including three.js, plus the bundled research datasets as static JSON. No
runtime downloads otherwise. Over 20 s of continuous
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

### Materials and lighting

The look is a calibrated instrument, not a photograph, and every term in it is hand-built —
there is no PBR pipeline and no image-based lighting, because the entire figure runs one shared
vertex program against the solved tension texture and the budget goes to translucent overdraw.
What the shading spends, and why:

- **Three-light rig + hemisphere ambient.** Cool key, warm fill, cold back rim — pre-normalised
  directions, no per-fragment normalise. The old flat ambient floor became a hemisphere term
  (cool skylight above, warm tissue-bounce below) so surfaces shadowed from all three lights
  still state their orientation; that is what keeps the trunk interior readable at the organ
  tier, and it costs one `mix()`.
- **Dual-lobe wet specular.** A tight glint plus a broad low sheen from the same half-vector —
  one extra `pow()`. Living tissue is never dry: one tight lobe reads as lacquer, sheen alone
  reads as chalk. Organs carry the strongest lobes (serosa), bone the weakest.
- **Subsurface transmission.** Key light arriving *through* the tissue when the surface sits
  between lamp and camera, strongest at grazing thickness. The transmitted colour is the albedo
  *squared* — filtered twice — which is why a backlit fascia saturates instead of whitening.
  Strength is per-material (`sss`): skin highest, membranes and fascia high, muscle moderate,
  bone a trace.
- **Fibre striation.** Darken-only grooves that vary *around* a structure's girth and run along
  its axis — the direction muscle fascicles and collagen bundles actually run. Counts are per
  girth (or per ribbon width), sheared a few degrees so they read as fibres, not print.
- **Depth-of-interest slab.** From the organ tier inward, tissue in front of the focal point
  sections away and tissue well behind it fades to a dark ground. The slab deepens as the scale
  descends: tight at the organ tier (a readable section), open at the tissue tier — at a
  twelve-millimetre span a tight slab sat entirely inside one muscle belly and left a black
  field.
- **Receptor tissue beds.** At the deepest tiers each modelled ending sits in the minimum
  procedural surrounding that makes it legible — extrafusal fascicles around the spindle,
  epidermal ridges over the Meissner corpuscle, the muscle–tendon junction through the Golgi
  organ, fat lobules and septa around the Pacinian. Beds are presentation only: not solver-bound,
  not pickable, no IDs.

All of it reads the same solved field: tension colouring, displacement and the force ramp are
untouched, and none of these terms exists on the Low tier's cost path (see the table).

### Quality tiers

| | Low | Medium | High | Ultra |
| --- | --- | --- | --- | --- |
| Render scale | 0.50–0.90× | 0.62–1.0× | 0.85–1.5× | 1.0–2.0× |
| MSAA | off | 2× | 4× | 4× |
| Bloom | off | one level | two levels | two levels |
| Translucent shells | rim-weighted, single-sided | full, double-sided | full, double-sided | full, double-sided |
| Lighting | rig + hemisphere ambient, no specular, no subsurface | full: dual-lobe specular + subsurface | full | full |
| Receptor tissue beds | off | on | on | on |
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

### Measuring on real hardware

Everything above was measured under a software rasteriser, which is the right tool for *ranking*
levers and the wrong tool for predicting frame rates. Real numbers need real GPUs. The build carries
what a tester needs:

1. **Open the diagnostics.** <kbd>Shift</kbd>+<kbd>F</kbd>, the fps chip in the top bar, or
   `Render ▸ Performance read-out`. It persists across reloads, so a measurement run does not begin
   with four clicks. The first thing to check is the GPU line at the bottom: if it says
   **SOFTWARE RASTERISER** in red, the machine is not using its GPU and nothing measured is
   meaningful. On Chrome, `chrome://gpu` says why.
2. **Lock a tier.** `Render ▸ Quality` — the choice persists, so Low / Medium / High / Ultra can each
   be measured across reloads without Auto moving underneath the test. Auto is the shipping default;
   locking is for measuring.
3. **Measure the two views that matter.** Whole-body at default layers is the fill-rate worst case
   because every envelope layer is drawn; the organ tier with all layers on is the overdraw worst
   case. Orbit slowly for ten seconds in each and read the frame time, not the fps — frame time is
   linear in cost and fps is not.
4. **Read what Auto did.** The `log` button in the diagnostics panel lists every decision with the
   frame time that caused it. `?qlog` in the URL traces the same lines to the console;
   `CONTINUUM.qualityLog()` prints them as a table.
5. **Send the numbers, not a description.** The `copy` button puts a full JSON report on the
   clipboard: GPU string, core count, device pixel ratio, viewport, tier, render scale, the complete
   tier settings, frame time, draw calls, triangles, drawn endings and beads, CPU solve time, the ID
   manifest signature and the whole decision log. `CONTINUUM.diagnostics()` returns the same object.

What good looks like, at 1920×1080 with the default layer set:

| Tier | Target frame time | Reads as |
| --- | --- | --- |
| Ultra | ≤ 8 ms | modern discrete GPU with headroom to spare |
| High | ≤ 16 ms | discrete GPU or Apple silicon holding 60 fps |
| Medium | ≤ 16 ms | recent integrated graphics holding 60 fps |
| Low | ≤ 33 ms | older integrated graphics, comfortably usable at 30 fps+ |

If a tier misses its target on hardware that should make it, the diagnostics say which lever to
suspect: high draw calls with low triangles means the layer set, not the geometry; frame time that
scales with the square of the render scale is fill-bound as expected; frame time that does not move
with render scale at all is CPU- or driver-bound and the `sim` row says whether the simulation is
responsible (it should read well under 1 ms).

Two artefacts belong to the software rasteriser and should **not** be read as GPU behaviour: the
absolute frame times, which are one to two orders of magnitude slow, and the apparent absence of any
gain from the translucent alpha cut and the specular-free lighting path, which a software rasteriser
does not reward. Everything else — draw calls, triangles, drawn counts, CPU time, the ID manifest,
Auto's decision sequence — is hardware-independent and can be trusted as it stands.

## Research overlays

An overlay is a flat map from anatomical ID to a number. That is the entire contract, and it is
deliberately the smallest one that can work: what an external tool has to produce is a list of names
it can look up in the manifest and a value for each. No coordinates, no geometry, no knowledge of how
the model is built or drawn.

Because of that, a shear-wave elastography export, a myotonometry session, a pressure-algometry sheet
and a modelling result all arrive the same way, and any of them can be substituted for another
without a code change.

```json
{
  "continuumDataset": 1,
  "id": "swe-shear-modulus-demo",
  "name": "Shear modulus · resting",
  "field": "value",
  "unit": "kPa",
  "source": "synthetic demonstration set · not measured data",
  "note": "Shown in the legend and in the chip tooltip.",
  "colorLow": "#2b6cb0",
  "colorHigh": "#ff6f52",
  "values": {
    "MUSCLE_ERECTOR_SPINAE_L": { "value": 11.8, "sd": 1.9, "n": 12 },
    "MUSCLE_ERECTOR_SPINAE_R": { "value": 16.4, "sd": 2.4, "n": 12 },
    "FASCIA_THORACOLUMBAR": 38.6,
    "ORGAN_DIAPHRAGM": 5.4,
    "THORAX": 9.0
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `continuumDataset` | no | format version; omitted means current. A newer version is refused rather than guessed at |
| `id` | **yes** | stable identifier; loading the same id twice replaces nothing — remove it first |
| `name` | **yes** | shown on the chip and in the inspector row |
| `field` | no | which key to read from record-valued entries; default `value` |
| `unit` | no | shown after every value and on the legend scale |
| `source` | no | provenance, shown under the legend and against every inspector row |
| `note` | no | how to read the data; shown in the legend |
| `colorLow` / `colorHigh` | no | six-digit hex; the ramp runs low → high across the dataset's own range |
| `values` | **yes** | ID → number, or ID → record containing `field` |

A value may be a bare number or a record. A record's other keys travel with it: `sd` and `n` are
shown in the inspector as `62.5 ± 9.1 (n=12)`, because a measurement without its dispersion and its
sample count is a number rather than a measurement.

Keys may be **a canonical ID, an alias, or a region code**. `ORGAN_DIAPHRAGM` resolves to
`MUSCLE_DIAPHRAGM`; `THORAX`, `PLANTAR_L` and `CERVICAL` fan out to every structure whose centre
falls in that region. That is what lets a dataset authored against different vocabulary bind without
being rewritten. Anything that cannot be resolved is **reported, not dropped** — the loader says how
many of how many bound and names the first few that did not, because an overlay silently covering 30
of 50 requested structures is worse than one that admits it.

Overlays paint through one per-structure uniform, written only when the overlay changes. The solved
field texture stays the single source of mechanical truth, so an active overlay costs nothing per
frame and the living physiology and tension mapping keep running underneath it. Datasets travel
inside saved projects, so a scene reloads with the data that was painted on it.

To load one: `Research overlays ▸ load…` for a file from disk, or click a dataset that ships with the
build. `CONTINUUM.api.validateDataset(objectOrJsonText)` checks a file without loading it, and
`CONTINUUM.api.registerDataset({...})` registers one programmatically. Research overlays are a
Professional capability, enforced in the property store rather than in the panel.

Datasets that ship with the build live in `public/datasets/` and are served as ordinary static files,
so adding or replacing one is a file copy and needs no rebuild — the same path an institution's own
exports take. Register a new file in `BUNDLED_DATASETS` in `src/platform/datasets.js` to have it
offered in the panel.

## Deployment

The build is a static site with no backend, no runtime downloads beyond its own assets, and no
environment variables.

```bash
npm ci
npm run build      # → dist/
```

Upload the **contents** of `dist/` to any static host — GitHub Pages, Netlify, Cloudflare Pages, S3
behind CloudFront, or a directory on any web server. `dist/` contains `index.html`, one JS bundle,
one CSS file, and `datasets/` for the bundled research overlays.

- **Paths are relative** (`base: './'`), so the app works from a domain root, a subdirectory or a
  project page (`example.github.io/continuum/`) without configuration.
- **No SPA fallback is needed.** There is one HTML entry point and no client-side routing; the app
  never asks the host for a path it did not serve. A catch-all rewrite is harmless but pointless.
- **Serve `datasets/*.json` as `application/json`.** Every host does by default. The overlay loader
  fetches them relative to the document, so they move with the app.
- **Requirements:** a WebGL2 browser. Node ≥ 22.12 to build, nothing at runtime.
- **Caching:** the JS and CSS filenames are content-hashed and can be cached indefinitely.
  `index.html` should not be — it names the hashed assets. The default headers on the hosts above
  already do the right thing.
- **HTTPS is worth having** for two small reasons: the clipboard API behind the diagnostics `copy`
  button needs a secure context, and `WEBGL_debug_renderer_info` is more reliably populated.
- **Nothing is sent anywhere.** No analytics, no fonts, no CDN, no telemetry. The session, the
  licence claim, saved projects and render preferences are all `localStorage` on the visitor's own
  machine.

Two query parameters exist for demos and for testing:

| Parameter | Effect |
| --- | --- |
| `?skip` | enter the workspace directly, bypassing the start screen — for demo links and automated tests |
| `?qlog` | trace every adaptive-quality decision to the console as it happens |

The start screen otherwise shows once per browser and can be reopened from the reference overlay.

## Accounts and entitlement

The gate is already enforced in the engine. What accounts add is the *signal* that drives it, and the
seam is one function:

```
┌───────────────┐  token   ┌────────────────┐  claim   ┌──────────────────┐
│ auth provider │ ───────► │ your backend   │ ───────► │ applyClaim()     │
│ magic link,   │          │ verify token   │          │ every engine gate│
│ OAuth, SSO    │          │ + read billing │          │ reads the result │
└───────────────┘          └────────────────┘          └──────────────────┘
```

`entitlements.applyClaim(claim)` is the only way the tier ever changes. A claim is small and says
exactly what a gate needs to know:

```js
CONTINUUM.api.applyClaim({
  tier: 'premium',            // 'free' | 'premium'
  holder: 'you@example.org',  // for display and support
  plan: 'professional',
  source: 'session',          // 'anonymous' | 'licence-key' | 'session' | 'api'
  issued: '2026-08-14T09:00:00Z',
  expires: '2026-09-14T09:00:00Z', // null for no expiry; a lapsed claim degrades on read
});
```

Nothing downstream of that call knows or cares where the claim came from. Adding real auth and real
billing therefore adds no capability checks and changes none — every `can()`, the scale ceiling,
`effectiveOpacity`, the tools and the overlay store keep working exactly as they do now.

**What ships here is a mock**, and deliberately a thin one. `src/platform/auth.js` holds a session
and a subscription record in `localStorage` and turns the pair into a claim. It never checks a
capability and never touches a feature. To make it real:

1. Replace `signIn` with the provider's redirect or magic-link request.
2. Replace `_resolveClaim` with a `fetch` that posts the resulting token to your backend and returns
   the claim. **This is the line that must move server-side**: a client that decides its own
   entitlement can be edited, so the claim has to be issued by something the user does not control.
3. Point `subscribe` at the payment provider's hosted checkout. The subscription arrives by webhook;
   the next claim refresh carries it.

Nothing else changes. The three provider buttons, the plan cards, the cancel-at-period-end behaviour
and the licence-key path are already wired to that shape. Offline and institutional seats keep the
key path, which resolves to the same claim with `source: 'licence-key'`.

## Validation matrix

`VALIDATION_MATRIX.md` classifies every substantial module against its scientific
anchor, a validation target, and an honest status — `grounded`, `partial`,
`novel`, `speculative` or `out_of_scope_v1`. **No row is validated against
measured data**, because this product holds no measured series, and the enum has
no value that would let a row claim otherwise.

Current inventory: 16 modules — 3 grounded, 7 partial, 3 novel, 1 speculative,
2 out of scope for v1. `CONTINUUM.validation.summary()` returns the counts, and
`node tools/check-validation-matrix.mjs` fails the build if the document and
`src/platform/validation.js` stop agreeing.

The matrix also carries a falsification note: in-sim experiments show a
*predicted* Δ under the receptor model given an assumed mechanical change. They
neither support nor falsify any human hypothesis, and a Δ of zero from a
saturated run is a model limitation rather than a negative result.

## Model layers and claim discipline

Every number carries a layer tag, and the layer says what kind of claim it is:
**A** a mechanical proxy from the solver, **B** the literature-style receptor
model, **C** a composite summary on the instrument strip. The whole telemetry
strip is C. Definitions for all of them — with formulas where a formula is what
honesty requires — are in `METRICS.md`, and the single source of truth is
`src/platform/layers.js`.

A **computational experiment** runs one protocol twice, once clean and once with
a mechanical perturbation, holding everything else identical, and reports the
difference in Layer A and B outputs. The perturbation is not a second physics
engine: it changes what reaches the receptor — less transmission, more lag — and
the receptor path is the same code in both conditions. Those two terms are this
product's own modelling assumption, carry the citation key
`REX_MODELLING_ASSUMPTION`, and have no literature source.

What such a result means, and the sentence printed under every one of them:

> In-silico prediction under the selected model — not human data, and not
> evidence for or against any hypothesis.

The model was built to express a set of mechanical ideas, so it cannot also be
their test. This product does not say *proves*, *validates the hypothesis*,
*diagnostic*, or *matches published data*, and shows no percentage as a
prediction-fidelity or validation score — there is no published series here to
score against. Protocol presets are called protocols, not benchmarks.

## Third-party scientific inspiration

The Microscope mode's optional **Extended** drive model is a simplified,
educational sketch inspired by:

> Blum KP, Horslen MG, Ting LH, et al. (2020) *Diverse and complex muscle spindle
> afferent firing properties emerge from multiscale muscle mechanics.*
> eLife 9:e55177. [doi:10.7554/eLife.55177](https://doi.org/10.7554/eLife.55177)

What is taken from that work is the **idea** of three phenomena worth showing: that
a Ia afferent's drive tracks intrafusal force and the rate of change of that force
rather than length and velocity alone; that a recent stretch leaves the receptor
less responsive to the next one, recovering over seconds; and that fusimotor drive
changes what the ending reports.

What is **not** taken from it: any code, figure, dataset, parameter value or
extended text. The equations in `src/sim/spindle_extended.js` were written for
this product. It is **not a reproduction** of that work, is not validated against
its figures or against any recording, and no quantitative agreement is claimed —
any would be a coincidence. The fourteen parameters carrying the citation key
`blum2020` are educational values chosen so the behaviour is visible at this
product's scale; the key marks the *phenomenon*, not the number, and every record
is `verified: false` until a human checks it.

The **Basic** drive model remains the product default. Extended is an explicit
choice in the Microscope panel, is labelled there, and carries the DOI beside the
read-out whenever it is running. See `MICRO_MODE.md` for equations and an
implemented-versus-missing table, and `SCENARIOS.md` for how to run the
demonstrations.

## Scope

A visualisation and teaching instrument for mechanical and sensory physiology. Structures follow
published adult proportions; the mechanics, viscoelastic filtering and rate coding model
published principles qualitatively rather than reproducing any measured dataset. Figures shown in
the inspector are representative literature ranges.

CONTINUUM is a literature-informed **simulation** for research and education. It is **not a medical
device**, **not a diagnostic tool**, and **not a substitute for professional medical advice,
diagnosis, or treatment**. It does not provide patient-specific clinical measurements or
histological truth, and it does not describe any individual body. Microscope and receptor views are
schematic and model-driven: display motion may be exaggerated for visibility, and numeric readouts
are model outputs rather than lab recordings. Do not use CONTINUUM to make clinical decisions.

### The acknowledgment gate

A blocking modal carries that text on first load and must be acknowledged before the application is
usable. It has no close control: no Escape, no backdrop dismissal, and `?skip` — which skips the
start screen — deliberately does not skip it. The primary button stays disabled until the checkbox
is ticked, focus is trapped inside the card, and the rest of the interface is `inert` while it is
up, so the 3D view and every control behind it are genuinely unusable rather than merely covered.

The acknowledgment is stored as `continuum_disclaimer_v1` — `{ version, acknowledgedAt }` — and is
honoured only when `version` matches `DISCLAIMER_VERSION` in `src/ui/disclaimer.js`. **Bump that
constant whenever the disclaimer text changes in substance**, so everyone re-acknowledges rather
than being held to wording they never read. Unreadable or absent storage resolves toward showing the
modal.

An always-on line in the top bar — *Simulation · Not diagnostic · Not a medical device* — shortens
but never disappears on narrow windows, and the same language appears in the help panel.

### The guided tour

Once the gate is acknowledged, a first-time user gets a ten-step walkthrough of the application —
navigation, scale, systems, the Inspector, intervention, telemetry, Microscope mode and Help — as
spotlit coach marks anchored to the real interface rather than a separate screen. It runs once per
`TOUR_VERSION`, can be restarted from **?** → *Restart guided tour*, and is not modal: the model
stays draggable throughout. `?tour=1` forces it (without skipping the disclaimer), and
`CONTINUUM.tour.reset()` clears the record. Full step list and test steps in `TOUR.md`.

The gate carries a short **models-and-grounding** paragraph as of v2: that module
status varies from grounded to speculative, that nothing here is validated
against measured human data, and where to find the inventory. Changing the gate
text in substance means bumping `DISCLAIMER_VERSION` so everyone re-acknowledges
— v1 records no longer count.

`npm run check` runs two static guards: `check:disclaimer` fails if the gate is
deleted, unwired, given a close control, stripped of its `inert` shielding, or
made bypassable by `?skip`; `check:validation` fails if the validation matrix
and its code drift apart. The first exists because the gate went missing once —
from a working copy taken before the gate commit landed, with nothing anywhere
saying "this build has no gate".

**Help (`?`)** is the practical manual: twelve sections covering the first-run
path, navigation, systems, intervention, the Level C meters, Microscope Basic vs
Extended, computational experiments, the A/B/C layers, the validation matrix and
citations. Each honesty point sits in the section it belongs to rather than in a
footer.

To test the gate:

```
CONTINUUM.disclaimer.reset()   // or: localStorage.removeItem('continuum_disclaimer_v1')
location.reload()
```

`CONTINUUM.disclaimer` also exposes `acknowledged()`, `record()` and `version`. Automated tests take
the returning-user route by seeding the key before load rather than clicking through on every run.

---

## Copyright and licence

Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.

CONTINUUM is **proprietary software**. `package.json` declares
`"license": "UNLICENSED"` — the SPDX identifier for software that carries no
public licence at all, not a placeholder awaiting an open-source choice. **No
open-source grant is made, expressly or by implication.** No right is granted to
use, copy, modify, distribute, sublicense, sell, reverse-engineer or create
derivative works from any part of this software except under a written agreement
signed by RexMetrix Technologies, LLC, and possession of a copy — repository,
bundle, archive, patch or deployed build — does not convey a licence.

Third-party dependencies keep their own licences, which this notice neither
extends to nor restricts. Attribution to published scientific work is a separate
matter from software licensing and lives where the work is used: `MICRO_MODE.md`,
`src/data/micro/literature_params.js`, `src/data/afferent_params.js`,
`VALIDATION_MATRIX.md` and `AFFERENT_PARAMS.md`.

Full terms, including the no-warranty clause, are in
[`PROPRIETARY_NOTICE.md`](PROPRIETARY_NOTICE.md).

Licensing changes nothing about scope. CONTINUUM is a literature-informed
simulation for research and education — **not a medical device, not a diagnostic
tool, and not a substitute for professional medical advice, diagnosis, or
treatment**. No module is validated against measured human data; see
`VALIDATION_MATRIX.md`. A licensee acquires no right to represent otherwise.
**Do not use CONTINUUM to make clinical decisions.**
