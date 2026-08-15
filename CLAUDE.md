# CONTINUUM

A standalone, self-contained commercial web application: a multi-scale simulation of living
biotensegrity and afferent flow. Vite + Three.js, no framework, no backend, no runtime downloads.

```bash
npm ci
npm run dev        # http://localhost:4180
npm run build      # → dist/  (upload the contents to any static host)
npm run preview
```

Requires a WebGL2 browser; Node ≥ 22.12 to build.

## Ground rules

- **This product carries no organisational, institutional or nonprofit references of any kind**, and
  no links to any organisation's site. It is a standalone for-profit product and must stay
  independently deployable. Do not add branding, footers, analytics, fonts or any other outbound
  request.
- **No clinical claims.** It is a visualisation and teaching instrument for mechanical and sensory
  physiology, not a diagnostic, clinical or treatment tool, and it does not describe any individual
  body. The scope note in the reference overlay and the start screen say so and must keep saying so.

## What must not regress

`README.md` is the specification as well as the documentation — it states the guarantees and the
numbers that back them. Before changing anything in `src/sim/`, `src/anatomy/registry.js`,
`src/platform/` or `src/core/quality.js`, read the relevant section first. In particular:

| Guarantee | Where it lives |
| --- | --- |
| Physics figures — continuity, viscoelastic filtering by receptor class, diaphragm–fluid coupling, 20 s stability | `src/sim/` |
| 1 740 anatomical IDs, manifest hash `238ca549` | `src/platform/ids.js`, receptor counts in `src/anatomy/receptors.js` |
| Freemium gates enforced in the engine, never in the UI | `src/platform/entitlements.js` and each capability's own source |
| Free/Professional telemetry split | `src/ui/hud.js` |
| Adaptive quality tiers and their measured levers | `src/core/quality.js` |

Identity must never depend on hardware, tessellation or build order: the ID manifest is a contract
that saved projects and external datasets resolve against.

## Verifying a change

The suites are Playwright scripts driving `npm run preview`. Re-run them after touching the
simulation, the identity layer, the gate or the quality system, and confirm the numbers are
unchanged rather than merely plausible:

- physics — the figures in README ▸ *What it is* must come back byte-identical
- gates — free tier blocked from deep scales, premium layers, tools, overlays and projects, including
  when scripted past the UI
- identity — `CONTINUUM.api.signature()` still `{ count: 1740, hash: '238ca549' }`
- projects — save, wipe, reload, including a loaded research overlay
- console — zero errors in normal use

`CONTINUUM.diagnostics()` in the browser console returns a full report; `?skip` bypasses the start
screen for tests, `?qlog` traces adaptive-quality decisions.
