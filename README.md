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
| `platform/ids.js` | ID derivation, aliases, region classification, manifest signature |
| `platform/properties.js` | Base properties, live state, datasets, parameter sets, subject data, provenance |
| `platform/entitlements.js` | Capability model, tiers, mock licence resolver |
| `platform/projects.js` | ID-keyed scene capture and restore, JSON export/import |
| `tools/` | Measurement probes and annotations, both ID-anchored |
| `ui/` | Systems panel, inspector, workspace panels, telemetry, entitlement states |

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
- **Descending sections the view.** From the organ tier inward the near plane advances toward the
  look-at point, and the enveloping layers fade — you can look at a heart without first deleting
  the chest wall.

### Budget

271 selectable structures · 1 740 anatomical IDs · 166 network nodes · 469 elements · ~245 draw
calls and ~160 k triangles per frame · 11 shader programs · 238 geometries · 8 textures. One
~225 kB gzipped bundle including three.js, no runtime downloads. Resolution adapts to hold frame
rate when quality is set to Auto. Over 20 s of continuous simulation the network's resting load
stays within 1 % of its calibrated baseline and maximum node drift is 15 mm, so nothing creeps.

The platform layer adds no per-frame cost to the engine: overlays are written to a per-structure
uniform only when they change, measurement and annotation labels are DOM with one shared line
buffer each, and property bags are composed on demand.

## Scope

A visualisation and teaching instrument for mechanical and sensory physiology. Structures follow
published adult proportions; the mechanics, viscoelastic filtering and rate coding model
published principles qualitatively rather than reproducing any measured dataset. Figures shown in
the inspector are representative literature ranges.

It is not a diagnostic, clinical or treatment tool, and it does not describe any individual body.
