# The guided tour

Ten coach-mark steps that walk a new user through the whole application. It runs
once, on the first visit, **after** the non-diagnostic disclaimer has been
acknowledged — never before, and never instead of it.

Implementation: `src/ui/tour.js`. This is the previous first-run onboarding
(`src/ui/onboarding.js`, now removed) grown into a full walkthrough rather than a
second system beside it — the card, the anchored placement and the directional
arrow are the same coach-mark pattern that was already there. What is new is the
step list, the spotlight, keyboard control, versioned storage, and steps that
adapt to what the current licence can actually reach.

---

## Order of first run

```
disclaimer gate  →  start screen  →  guided tour
   (mandatory)      (once/browser)    (once/version)
```

The tour is started from `enterWorkspace()`, which runs when the start screen is
dismissed — so on a genuine first visit it opens 700 ms after the user clicks
**Start exploring**. With `?skip` (which bypasses the start screen but *not* the
disclaimer) it opens straight after the acknowledgment.

It never begins while the gate is up: the gate marks the whole interface `inert`,
and the tour is only reached through the promise that gate resolves.

---

## Steps

| # | Title | Anchor | Subject |
|---|---|---|---|
| 1 | Welcome to CONTINUUM | *centred* | what this is; simulation, not diagnosis |
| 2 | Move around the body | viewport | orbit, pan, zoom; the body is already alive |
| 3 | Scale is one continuum | scale rail | five orders of magnitude; keys 1–5 |
| 4 | Turn systems on and off | systems panel | per-system visibility and isolation |
| 5 | Click to inspect | Inspector | selection, shift-click, double-click |
| 6 | Load the tissue | Mechanical intervention | tension/compression/restriction/shear/release |
| 7 | Read the live instrument | telemetry strip | network load, fidelity, afferent rate |
| 8 | Microscope mode | Microscope section | one spindle ROI; schematic and model-driven |
| 9 | Help is always here | ? button | the reference, and restarting this tour |
| 10 | Go and explore | *centred* | closing reminder: simulation only |

Every title is six words or fewer; every body is under fifty words and at most
three sentences. Measured across all ten: titles 2–5 words, bodies 20–33 words,
2–3 sentences.

Steps 3, 6 and 8 have two versions of their body. On the free tier they describe
the feature and say which tier reaches it, because the product deliberately
leaves locked controls visible — a tour that silently skipped a third of the
application would leave an Explorer user not knowing what they had not seen. Step
6 also gains a **See the plan** button on the free tier.

Step 6 does *not* actually apply an intervention. It points at the control and
describes it; running a load on the user's behalf would leave the model in a
state they did not ask for.

---

## Behaviour

**Not modal.** The spotlight is one element whose box is the lit region and whose
huge spread shadow is the dim everywhere else. Neither it nor the coach host
takes pointer events, so the model keeps running and stays draggable mid-tour —
someone who starts orbiting during step 2 is doing exactly what step 2 asked.
Verified: pressing `2` during the tour still moves the scale, and nothing is
marked `inert`.

**Layering.** Spotlight 74, coach host 75, disclaimer 200. The gate always wins.

**Keyboard.** `Enter` or `→` advances, `←` goes back, `Esc` skips. Escape is
deliberately the opposite of the disclaimer's behaviour: that one refuses to
close, this one lets go the moment somebody wants it gone. The **Next** button
takes focus on each step.

**Narrow windows.** A card that would be clamped over the panel it is pointing at
re-centres below its anchor instead, and the action buttons wrap. Verified at
760 px: all ten steps fully inside the viewport, nothing clipped.

**Missing anchors.** A step whose anchor does not exist or is hidden loses its
spotlight and arrow but keeps its card centred — the text is the content, and
dropping a step because a panel is collapsed would teach less, silently.

---

## Storage

`continuum_tour_v1` → `{ version, completedAt }`.

Honoured only when `version` matches `TOUR_VERSION` in `src/ui/tour.js`. **Bump
that constant when the steps change substantially** so everyone sees the updated
tour once. Both finishing and skipping count as completed — a product that makes
a returning user close a tour has taught them to close things.

Unreadable storage is treated as *completed*, the opposite of the disclaimer's
default. Nagging every load is the worse failure for a tutorial and the safer one
for a disclaimer.

---

## How to test

**From the console:**

```js
CONTINUUM.tour.start()      // run it now, even if completed
CONTINUUM.tour.stop()       // close without recording completion
CONTINUUM.tour.reset()      // clear the record; it runs again on next load
CONTINUUM.tour.completed()  // boolean
CONTINUUM.tour.record()     // { version, completedAt } or null
CONTINUUM.tour.running      // boolean
CONTINUUM.tour.step         // 0-based index
CONTINUUM.tour.steps()      // step ids, in order
```

**Full first-run path:**

```js
localStorage.clear(); location.reload();
```

Expect: disclaimer → tick the box → **I understand — enter CONTINUUM** → start
screen → **Start exploring** → tour step 1 of 10.

**Force it without clearing anything:** load `?tour=1`. This forces the tour
only; the disclaimer still appears if unacknowledged.

**From the UI:** press `?` → **Restart guided tour**.

**Automated runs** seed both keys before load rather than clicking through:

```js
localStorage.setItem('continuum_disclaimer_v1', JSON.stringify({ version: '1', acknowledgedAt: '1970-01-01T00:00:00Z' }));
localStorage.setItem('continuum_tour_v1',       JSON.stringify({ version: '1', completedAt:    '1970-01-01T00:00:00Z' }));
```

---

## Verified

Tour does not start while the gate is up (`running: false`, coach host hidden, no
spotlight in the DOM); starts on its own after acknowledgment; all ten steps in
order with the copy limits above; eight of ten spotlit, the two centred steps by
design; `Enter` advances through every step; last button reads **Done**, the
others **Skip tour**; completion recorded and quiet on reload; **Restart guided
tour** in Help reopens at step 1 and closes the help panel; `Esc` and **Skip
tour** both end it; `reset()` and a stale `version` each make it run again;
`?tour=1` forces it without skipping the disclaimer; premium and free wordings
both within limits; nothing clipped at 760 px; no FDA, clinical-validation,
autism, treatment or donation language anywhere in the step text; zero console
errors.

Unchanged by this work: the disclaimer gate, Microscope mode and its caption,
Shift+M, the 1740/`238ca549` manifest, freemium gates, telemetry split, research
overlays and project round-trip.
