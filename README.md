# CONTINUUM

**Living biotensegrity and afferent flow** — an interactive, multi-scale simulation of the body
as a single continuous tension network, from whole body down to individual mechanoreceptors.

A standalone product. Self-contained: no backend, no assets to download, no external services.
Every structure is generated procedurally at load time.

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

## How it works

```
network topology ──► tensegrity solver ──► field texture (256×1 float)
                            ▲                      │
       physiology ──────────┘                      ├──► every tissue shader
   (writes rest state)                             │    (deformation + colour)
                                                   ├──► afferent model
                                                   │    (mechanotransduction)
                                                   └──► signal streams, telemetry
```

One solve per frame drives everything visible. The solver publishes node displacement and
tension deviation into a small float texture; every tissue mesh is bound at build time to its two
nearest network nodes and reads that texture in its vertex shader. Breathing, pulse, organ
motility and applied load therefore move and colour all seven visible systems from a single
source of truth, with no per-mesh CPU work.

| Module | Responsibility |
| --- | --- |
| `sim/tensegrity.js` | Node/cable/strut network, position-based dynamics, tension-only cables, resting-baseline calibration |
| `sim/physiology.js` | Cardiac and respiratory waveforms, rib kinematics, visceral motility, fluid transport |
| `sim/afferent.js` | Standard-linear-solid tissue filter, per-class transduction, rate coding, fidelity/latency/bandwidth |
| `anatomy/` | Procedural geometry for eight systems + receptor fields + receptor micro-anatomy |
| `gfx/` | Shared tissue shader, signal streams, network overlay, post pipeline |
| `core/` | State store, scale-aware orbit controls, multi-scale manager |
| `ui/` | Systems panel, inspector, intervention/physiology/render controls, telemetry |

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

271 selectable structures · 166 network nodes · 469 elements · ~243 draw calls and ~160 k
triangles per frame · 11 shader programs · 238 geometries · 8 textures. One 206 kB gzipped
bundle including three.js, no runtime downloads. Resolution adapts to hold frame rate when
quality is set to Auto. Over 20 s of continuous simulation the network's resting load stays
within 1 % of its calibrated baseline and maximum node drift is 15 mm, so nothing creeps.

## Scope

A visualisation and teaching instrument for mechanical and sensory physiology. Structures follow
published adult proportions; the mechanics, viscoelastic filtering and rate coding model
published principles qualitatively rather than reproducing any measured dataset. Figures shown in
the inspector are representative literature ranges.

It is not a diagnostic, clinical or treatment tool, and it does not describe any individual body.
