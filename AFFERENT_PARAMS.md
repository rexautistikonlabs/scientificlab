# Afferent parameters — provenance, and how to verify a row

The whole-body afferent model reads 42 numeric constants: six for each of the
seven receptor classes. They used to be bare literals in `src/anatomy/info.js` —
no unit, no range, no species, no source. They now live in
`src/data/afferent_params.js` with all of those, and `info.js` reads from it.

**No value changed.** This was provenance, not retuning:
`tools/check-afferent-params.mjs` holds a frozen baseline and fails if any
number moves without the baseline moving with it.

---

## What the table actually says

| category | count | what it means |
|---|---|---|
| `MODEL_TUNING` | **21** | No external anchor. Chosen so the class behaves qualitatively as its adaptation label describes. |
| `TEXTBOOK_CONSENSUS_BAND` | 7 | Sits inside the frequency band the class is described by. The band is consensus; the centre value is not sourced. |
| `TEXTBOOK_CONSENSUS_CV` | 7 | Sits inside the conduction-velocity range for that fibre class. Same caveat. |
| `TEXTBOOK_CONSENSUS_SIZE` | 7 | Order-of-magnitude dimension. Drives drawing only — the transduction model never reads it. |
| **verified** | **0** | Nothing here has been checked against a primary source. |

The split by parameter, which is the part worth internalising:

| parameter | category | why |
|---|---|---|
| `bestHz` | band | inside a stated, citable band |
| `cvNum` | conduction velocity | inside a stated, citable range |
| `size` | size | order of magnitude, geometry only |
| `tau` | **tuning** | adaptation time constant, chosen to produce the described behaviour |
| `threshold` | **tuning** | in the engine's own normalised load units, which have **no physical scale** |
| `phasic` | **tuning** | rate-vs-level split expressed as one number |

`threshold` deserves the emphasis. It is not a force and not a displacement; it
is a fraction of an internal normalised load. There is no conversion to physical
units without a calibration this product does not have, so no `threshold` value
can ever be "verified" in the sense the other rows can.

---

## How to verify one row

Do this **one record at a time**. Never in bulk, and never because a value looks
reasonable.

1. **Pick a record with a `TEXTBOOK_CONSENSUS_*` category.** The `MODEL_TUNING`
   group cannot be verified — see above. If you think one can, that is a real
   finding and the category is wrong, so change the category first.

2. **Find a primary source** for the quantity in that receptor class. A review
   is acceptable if it reports the measurement; a textbook citing a review is
   not — you want the number's origin, not its third printing.

3. **Check three things against the source**, not one:
   - the quantity is the same quantity (a "best frequency" from a threshold
     tuning curve is not the same as one from a suprathreshold rate curve);
   - the species and preparation are stated in the record's `species` field, and
     if the source is animal and the record says `unspecified`, fix the field;
   - the value in the table lies inside what the source reports. If it does not,
     do **not** move the value to match — record the discrepancy in `notes` and
     raise it, because the model was tuned around the value that is there.

4. **Fill in the citation**: replace the category key with a real key, add the
   `doi`, and set `verified: true` **on that record only**.

5. **Run the guards**:
   ```bash
   npm run check:afferent      # values still match the frozen baseline
   npm run check:validation    # the matrix still agrees with the code
   ```
   `check:afferent` rejects `verified: true` without a `doi`, because verifying
   means having read something.

6. **If verification changes a value**, that is a retune, not a documentation
   fix. Update the baseline in `tools/check-afferent-params.mjs` in the same
   commit, say so in the message, and re-run the physics and telemetry suites —
   these constants feed the whole telemetry strip.

---

## Console

```js
CONTINUUM.afferentParams.summary()        // counts by category, verified count
CONTINUUM.afferentParams.all()            // every record
CONTINUUM.afferentParams.forClass('spindle')
CONTINUUM.afferentParams.get('pacinian', 'tau')
CONTINUUM.afferentParams.rangeViolations() // must be empty
```

---

## Where this sits

`VALIDATION_MATRIX.md` row *Whole-body afferent / transmission path* moved from
`speculative` to `partial` when this table landed — the structure now exists.
It will not move further until individual records are verified, and the
`MODEL_TUNING` group means the row cannot reach `grounded` as a whole.

Nothing here is validated against measured data. The table makes that fact
legible instead of leaving it implicit in a wall of unlabelled numbers.
