# Handoff: drive section detection to 90% (autonomous agent brief)

You are an autonomous coding agent (e.g. Antigravity) running **locally in this
repo, on the machine that holds the audio files.** Your job is to improve Cue
Track's musical **section detection** (where intro / verse / chorus / bridge /
outro are, and their labels) to **≥ 90% accuracy on a held-out test set —
honestly.** Everything you need is already in `eval/sections/`. Read this whole
file before acting.

## The one rule that matters most

**Do not game the number.** A grader that can be cheated is worse than useless.
These invariants are non-negotiable:

1. **Never tune on the test split.** You optimize on `dev`. The `test` split is
   sealed (`corpus.ts` assigns splits by a fixed hash; `TestSetGuard` budgets
   test evaluations). Touch test only to validate a dev-selected change, and
   only through the guard.
2. **Plausibility ≠ accuracy.** `structure-checks.ts` (does it look like a real
   song?) is a *sanity filter* to catch obvious errors fast, with no labels. It
   must NEVER be added to the accuracy score, or the detector could "win" by
   always emitting a textbook structure that's misaligned with the audio.
   Accuracy is only ever `grade.ts` vs ground-truth labels.
3. **Every change is measured, then kept or reverted.** No change ships on a
   hunch. If `run-eval` doesn't show it helps on dev AND it doesn't trip new
   regressions, revert it.
4. **Generalize, don't memorize.** 30–50 songs is an *eval* set, not a training
   set. Make changes that are musically general (priors, repetition logic),
   never per-song hacks. A large dev→test gap means you overfit — report it and
   back off.
5. **Keep the build green.** Run `npx tsc --noEmit` and `npx vitest run` after
   every change. Never commit red.
6. **Stay in your lane.** Only edit the detector
   (`services/audio-worker/lib/audio/foote-analyze.ts`) and the eval tooling
   (`eval/sections/**`). Do NOT touch payments, auth, or app routes.

## What already exists (don't rebuild it)

- `grade.ts` — the anti-cheat grader (semantic labels, one-to-one matching,
  frame accuracy, degeneracy flags). `grade.test.ts` proves the cheats fail.
- `corpus.ts` — sealed train/dev/test split + `TestSetGuard`.
- `run-eval.ts` — score a detector over a split. `--via http --detector ml|foote`
  scores a *deployed* worker; default runs Foote offline (env-tunable).
  `--postprocess` applies the structural constraints so you can A/B them.
- `tune.ts` — autonomous Foote-parameter search (optimizes dev, validates test).
- `label-with-teacher.ts` — auto-label audio with allin1 (the teacher).
- `structure-checks.ts` / `structure-postprocess.ts` — plausibility flags +
  conservative constraints.
- `export-corrections.ts` — grade real user corrections from `analyze_outcomes`.
- Foote knobs are env vars (`FOOTE_KERNEL_SIZE`, `FOOTE_PEAK_THRESHOLD_K`,
  `FOOTE_MEL_BANDS`, `FOOTE_CLUSTER_SIM_THRESHOLD`, `FOOTE_MIN_GAP_BARS_*`).

## Prerequisites (confirm before starting)

- Node ≥ 22, `npm install` at repo root, and `cd services/audio-worker && npm install`.
- The audio files in a folder (ask the human where; expect ~25–50 songs).
- The **allin1 ML worker deployed** and reachable via `ML_WORKER_URL` +
  `ML_WORKER_SHARED_SECRET` (see `services/ml-worker/DEPLOY.md`). If it isn't
  deployed, deploy it first or ask the human to.

## Procedure

### Step 0 — Measure allin1 first (you might be done already)
allin1 is a strong, purpose-built model. Before improving Foote, find out if
allin1 already clears the bar:
```
# Auto-label with allin1, then sanity-check it on a few HUMAN-labeled songs.
ML_WORKER_URL=… ML_WORKER_SHARED_SECRET=… \
  npx tsx eval/sections/label-with-teacher.ts --audio <audio-dir> --out corpus
```
Have the human correct ~8 songs to gold (or supply public Harmonix labels), put
them in `corpus/labels/`, then:
```
npx tsx eval/sections/run-eval.ts --corpus corpus --split test --allow-test --via http --detector ml
```
If allin1's per-section ≥ 90% with clean guards → **recommend routing to it**
(`ANALYZE_AB_SPLIT_PERCENT=100`) and stop. The Foote loop below is only needed
if allin1 is too slow/costly and the cheap detector must hit 90% too.

### Step 1 — Build the corpus
`label-with-teacher.ts` already wrote `corpus/manifest.json` + `labels/`. The
allin1 labels are SILVER. Replace the **test-split** songs' labels with human
gold (the human corrects them) so the held-out number is trustworthy. Keep
allin1-silver for train/dev. The split is deterministic, so
`corpus.ts:splitFor(id)` tells you which songs are in test.

### Step 2 — Baseline
```
npx tsx eval/sections/run-eval.ts --corpus corpus --split dev
```
Record the headline, frame accuracy, and the `implausible` list. This is the bar
to beat.

### Step 3 — The improvement loop (iterate on dev)
Repeat until the stop condition:
1. Run `run-eval --split dev`. Read the `implausible` songs and `worst10`.
2. **Diagnose the dominant error class.** Examples and the likely fix:
   - *"7 verses" / too many verses, too few choruses* → the labeler isn't
     weighting repetition. A **repetition-aware chorus labeler** already exists
     (`section-labeling.ts`, gated by `FOOTE_REPETITION_WEIGHT`, default 0 =
     legacy energy-only). First just sweep that weight up (the tuner already
     includes it); if it's not enough, extend the labeler (e.g. lower the SSM
     cluster threshold so repeats actually group, or feature-weight tweaks).
   - *over-segmentation / tiny spurious sections* → tune `FOOTE_PEAK_THRESHOLD_K`
     up and/or `--postprocess` (merge-adjacent + absorb-short), MEASURED.
   - *boundaries consistently late/early* → kernel size / novelty smoothing.
   - *good boundaries, wrong names* → the labeling heuristic, not the novelty.
3. Make ONE targeted, musically-general change.
4. `npx tsc --noEmit && npx vitest run` — must stay green.
5. Re-run `run-eval --split dev`. Keep the change only if the headline improves
   (or implausibleFraction drops with headline flat) and nothing regresses.
   Otherwise revert.
6. Every few accepted changes, validate on test **once** through the guard:
   `npx tsx eval/sections/run-eval.ts --corpus corpus --split test --allow-test`.
   Log dev vs test. If test lags dev badly, you're overfitting dev — stop adding
   narrow rules and prefer general ones.
7. Commit each accepted change with a message stating the dev delta.

You may also run `tune.ts` for an unattended parameter sweep between manual
algorithm changes.

### Step 4 — Stop conditions
- **Success:** `run-eval --split test --allow-test` reports `meetsTarget: true`
  (per-section ≥ 0.9, frame floor met, guards clean) with a small dev→test gap.
  Write the winning Foote env config and open a PR. Recommend the human flips
  the worker env / `ANALYZE_AB_SPLIT_PERCENT`.
- **Plateau:** if several iterations don't move test, stop and report the best
  config, the remaining error classes, and whether routing to allin1 is the
  better call. Do NOT keep adding narrow rules to force the number.

## When to involve the human
- To correct the ~8 gold test songs (Step 1) and to grade a batch when asked.
- Before any change that would touch app/auth/payment code (don't).
- When success or plateau is reached — report, don't keep grinding.

## Report format (each iteration)
Append to `eval/sections/runs/handoff-log.md`: the date, the change, dev before→
after (headline / frame / implausible), any test validation, and keep/revert.
Keep it skimmable so the human can audit the trajectory at a glance.
