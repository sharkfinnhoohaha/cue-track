# Section-detection eval & auto-tuning

A closed measurement loop to push section detection (where the intro / verse /
chorus / bridge / outro are, and what they're called) toward **90%+ — for real,
not gamed.**

The whole point is the grader can't be cheated. If `run-eval` / `tune` report
90% on the held-out test set with clean guards, the detector genuinely is that
accurate.

---

## The anti-cheat contract

A model "hits 90%" only when **all** of these hold on the **locked test split**:

1. **Per-section accuracy ≥ target** (`grade.ts → perSectionCorrectness`):
   one-to-one matching of predicted↔reference sections, requiring the **same
   canonical label** and a start boundary within tolerance, with a
   `max(#pred, #ref)` denominator. Over-segmenting or under-segmenting both
   lower it.
2. **Frame accuracy floor** (`frameLabelAccuracy`): an independent, boundary-
   agnostic check that ≥X% of the timeline is labeled correctly. Labeling
   everything "chorus" caps out at chorus's timeline share (~30%), never 100%.
3. **No degeneracy flags** (`degeneracyFlags`): wrong segment counts, label
   collapse, opaque/"other" labels, or boundary spam invalidate the run.
4. **Semantic labels only**: scores compare canonical labels (intro/verse/…),
   never optimally-relabeled cluster ids. Opaque "A/B/C" labels score **zero**.
5. **Sealed test set** (`corpus.ts`): the song→split assignment is a fixed hash
   (a song never migrates splits; you can't re-roll for an easier test set), and
   test is only scored through a `TestSetGuard` with a small budget so the loop
   can't hill-climb on it.

The honest gate is the single boolean `AggregateScore.meetsTarget`. The tuner
also reports the **dev→test gap**; a big gap means it overfit to dev and is
*not* actually accurate — and it says so instead of claiming success.

See `grade.test.ts` for adversarial tests that prove each cheat (label collapse,
over-segmentation, opaque labels, one giant segment) scores low and is flagged.

---

## Building a corpus (audio + labels)

A corpus is a directory with `manifest.json` (or just paired files):

```
corpus/
  manifest.json                 # [{ id, audio, labels, source }]
  audio/song-001.mp3
  labels/song-001.sections.json # { "duration": 212.4, "segments": [ {start,end,label}, … ] }
```

**Audio sourcing — read this.** You asked for "Billboard Top 100 / similar
genre." Those recordings are copyrighted and **cannot be freely/legally
downloaded or scraped**, and this repo will not do that. Public MIR datasets
ship **annotations, not audio**:

- **Harmonix Set** (~900 Western pop songs) — beat/downbeat + segment functions.
- **SALAMI** — structural annotations across genres.

You supply the audio yourself (your own licensed copies), name each file to its
annotation id, then:

```bash
npx tsx eval/sections/import-annotations.ts \
  --in harmonix/segments --out corpus --audio /path/to/your/audio --format harmonix
```

Best signal for *your* users (worship / live) is your own catalog — hand-label
20–50 songs, or harvest production corrections (below).

### Free, genre-matched labels from production

`analyze_outcomes` already records, per finalized track, the detector's
prediction **and** the user's correction. Grade prediction-vs-correction to get
a continuously-updating production accuracy number per detector — no audio, no
manual labeling:

```bash
DATABASE_URL=... npx tsx eval/sections/export-corrections.ts --labels-dir corpus/labels
```

(Slight over-estimate, since users don't always fully correct — use it as a
trend line; the audio-backed corpus is the release gate.)

---

## Running it

```bash
# Score the current detector on dev (needs the worker package installed):
npx tsx eval/sections/run-eval.ts --corpus corpus --split dev

# Auto-tune for a few hours (searches Foote params on dev, validates on test):
npx tsx eval/sections/tune.ts --corpus corpus --minutes 180 --target 0.9

# Final, honest number on the held-out set (do this rarely):
npx tsx eval/sections/run-eval.ts --corpus corpus --split test --allow-test
```

`tune.ts` writes `eval/sections/runs/tune-<ts>.jsonl` (every trial) and
`best-<ts>.json` (the winning config + an honest PASS / NOT-YET summary). Apply
a winning config by setting its `FOOTE_*` env vars on the audio worker.

The tunable knobs are env-overridable in
`services/audio-worker/lib/audio/foote-analyze.ts` (`FOOTE_KERNEL_SIZE`,
`FOOTE_PEAK_THRESHOLD_K`, `FOOTE_MEL_BANDS`, `FOOTE_CLUSTER_SIM_THRESHOLD`,
`FOOTE_MIN_GAP_BARS_*`); unset = production defaults.

---

## Two improvement loops

**1. Parameter search (this harness, autonomous).** `tune.ts` runs unattended
for hours over the param space. Good for squeezing the current algorithm.

**2. Agentic, code-level (Claude Code `/loop`).** Parameters alone may not reach
90% — the bigger wins are algorithmic:
- a **repetition-based chorus labeler** (choruses repeat; use the self-
  similarity matrix to find repeated segments instead of the current loudness
  heuristic);
- better features (chroma vs MFCC weighting), kernel/novelty tweaks;
- routing more traffic to the **allin1 ML worker** if it wins (raise
  `ANALYZE_AB_SPLIT_PERCENT`) — `run-eval` can score it too via an ML adapter.

Drive these with the `/loop` skill, using **this grader as the gate**: each
iteration runs `run-eval --split dev`, you edit the detector, re-run, and only
promote a change that improves dev *and* holds up on a (budgeted) test check.
The sealed split + degeneracy guards keep an agentic loop honest exactly the
same way they keep the parameter search honest.

## Release gate

Ship a detector change only when `meetsTarget` is true on the **test** split
with a small dev→test gap. Wire `run-eval --split test --allow-test` into CI and
fail the build if `meetsTarget` is false.
