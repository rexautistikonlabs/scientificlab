# Research overlay datasets — the format, and how to author one

A dataset binds numbers to anatomical IDs. That is the whole contract, and it is
deliberately the smallest one that can work: the thing an external tool has to
produce is a list of names it can look up in the manifest, and a value for each.
No coordinates, no geometry, no knowledge of how the model is built or drawn.
A shear-wave elastography export, a myotonometry session, a pressure-algometry
sheet and a modelling result all arrive the same way.

Two demonstration files ship with the build, in `datasets/`:

| file | shape it demonstrates |
| --- | --- |
| `shear-modulus-demo.json` | records with dispersion, an alias, an unresolved ID |
| `passive-stiffness-atlas.json` | a whole-body atlas: ~60 explicit IDs, region fan-out floors, aliases, unresolved reporting |

Both are synthetic. They are format demonstrations, not measurements, and they
say so in their `source` and `note` fields — a field your real dataset should
use for the same honesty.

---

## The file

```json
{
  "continuumDataset": 1,
  "id": "my-lab-session-042",
  "name": "Passive stiffness · pre-intervention",
  "field": "value",
  "unit": "N/m",
  "source": "MyLab · MyotonPRO · 2026-03-14",
  "note": "Anything the reader of the legend should know.",
  "colorLow": "#3a7bd0",
  "colorHigh": "#ff8a4a",
  "values": {
    "MUSCLE_TRAPEZIUS_L": 318,
    "MUSCLE_TRAPEZIUS_R": { "value": 342, "sd": 25, "n": 5 },
    "FASCIA_DEEP_CERVICAL": 655,
    "PLANTAR": 410
  }
}
```

| field | required | meaning |
| --- | --- | --- |
| `continuumDataset` | yes | format version — currently `1`; newer files are rejected with a reason |
| `id` | yes | stable identifier for the dataset itself (used by projects to restore the active overlay) |
| `name` | yes | what the legend shows |
| `field` | no | which member of a record carries the painted number — default `"value"` |
| `unit` | no | shown beside the range in the legend and the inspector |
| `source` | no | provenance line — device, lab, date. Say "synthetic" if it is |
| `note` | no | free text under the legend |
| `colorLow` / `colorHigh` | no | hex endpoints of the ramp; the range auto-scales to the bound values |
| `values` | yes | the payload — see below |

## Keys: four things a key may be

Resolution is attempted in this order, per key:

1. **Canonical ID** — `MUSCLE_TRAPEZIUS_L`, exactly as in the manifest
   (`CONTINUUM.api.manifest()` lists all 1 740).
2. **Alias** — accepted spellings resolve to the same structure:
   `FASCIA_DEEP_CERVICAL` → `FASCIA_CERVICAL_DEEP`, `ORGAN_DIAPHRAGM` →
   `MUSCLE_DIAPHRAGM`. Your vocabulary does not have to match ours.
3. **Region code** — a key that resolves to no ID is tried as a region and
   **fans out** to every structure whose centre lies in it: `CERVICAL`,
   `THORAX`, `ABDOMEN`, `PELVIS`, and sided codes `ARM_L`, `FOREARM_R`,
   `THIGH_L`, `LEG_R`, `PLANTAR_L`, `HAND_R`… A bare `PLANTAR` or `LEG`
   matches both sides. Fan-out never overrides an explicit entry that came
   earlier in the file, so regions work as *floors* under specific
   measurements.
4. **Unresolved** — anything left is reported, by name, in the legend and the
   loader toast. A dataset that half-binds is a data problem the user needs to
   see, not one to hide. Nothing is silently dropped.

## Values: numbers or records

A value may be a bare number, or a record whose `field` member is painted:

```json
"MUSCLE_GASTROC_R": { "value": 311, "sd": 27, "n": 5 }
```

`sd` and `n` are shown in the inspector alongside the value — a measurement
without its dispersion and sample count is only a number. Any other members are
preserved and available to future consumers; only `field` must be a finite
number.

## How it behaves in the product

- **Painting** is one per-structure uniform, written when the overlay changes —
  never per frame, and never through the solved field texture, so the
  single-solve architecture is untouched.
- **Premium-gated at the engine**: `setOverlay` and `paintOverlay` both check
  the `data.overlays` capability, so a lapsed or downgraded claim stops the
  paint on the next call — scripting the console does not get around it.
- **Projects** save loaded datasets and the active overlay and restore both,
  against a future build if necessary: anything that no longer resolves is
  reported, not dropped.
- **Validation before shipping**: `CONTINUUM.api.validateDataset(objOrJson)`
  runs the same validator the file picker uses, so a pipeline can check its
  export without loading it.

## Authoring checklist

1. Export your values keyed by whatever vocabulary you have.
2. Map what you can to canonical IDs (`CONTINUUM.api.manifest()`); leave the
   rest — aliases and regions may catch them, and the loader will name
   anything that stays unresolved.
3. State `unit`, `source`, and honesty in `note`. Synthetic or pilot data must
   say so.
4. Validate with `CONTINUUM.api.validateDataset(...)`.
5. Drop the file next to the app (`datasets/`) or load it through
   *Workspace → Load dataset*. No rebuild is needed either way.
