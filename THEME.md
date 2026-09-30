# CONTINUUM — house theme

CONTINUUM's chrome and its WebGL clear colour read from the RexMetrix
instrument-lab palette, so rexmetrix.com → continuum.rexmetrix.com feels like
one house. Tokens only — no product copy, no simulation math, no layer or
signal semantics changed.

## Tokens (`:root`, `src/styles.css` — house palette block)

| token | value | role |
| --- | --- | --- |
| `--ink` | `#0b0c0a` | room / page, and the WebGL renderer clear colour |
| `--ink-2` | `#141511` | cards, the gate panel |
| `--ivory` | `#e8e0d2` | type on dark |
| `--ivory-dim` | `#b7b09f` | secondary type |
| `--ivory-3` | `#8b8574` | quietest annotations |
| `--phosphor` | `#8f9a6e` | running / primary actions — muted, not neon |
| `--phosphor-2` | `#c5c9a8` | hover / focus ring |
| `--rule` | `#2a2c26` | borders |
| `--refuse` | `#6e4a3a` | warnings only |

Legacy tokens (`--cyan`, `--cyan-dim`, `--jade`, `--glass`, `--paper*`,
`--accent`, `--line*`) are re-pointed at this palette in the same block, which
is what retired every teal/cyan/mint button, glow and veil at once. Selection
and isolate highlights in the 3D view are phosphor; the backdrop, ground rings
and measurement ink follow the same family.

## Deliberately retained hues (not brand)

These are the model's scientific colour language, unchanged by design:

- **Afferent packets and micro spike pulses stay cyan → white** — the locked
  signal-direction code (inward), paired against gold / gold-violet / rose
  efferent traffic. They are data glyphs, not chrome.
- **Anatomy layer colours** (superficial/deep fascia teals, lymph green, per-
  receptor-class hues in `store.js` / `info.js` / `chains.js` / `fascia.js` /
  `neuro.js`) — model content the panels and the 3D tissues share; changing
  them would change what the layers mean, which the gate forbids.
- **Tension amber → copper** — the mechanical load ramp.

House palette; math unchanged.
