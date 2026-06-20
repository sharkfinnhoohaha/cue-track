# Agent instructions — Cue Track

If you are an autonomous coding agent (Antigravity, Claude Code, …) and a human
handed you this repo, your task is to improve musical **section detection**
(finding the intro / verse / chorus / bridge / outro and labeling them) to
**≥ 90% accuracy on a held-out test set — honestly.**

## Start here

1. **Read `eval/sections/HANDOFF.md` in full and execute it.** It is the
   complete brief: prerequisites, the exact commands, the improvement-loop
   algorithm, and the stop conditions.
2. The human runs `bash eval/sections/setup.sh` once (it labels their audio with
   the allin1 teacher and prints a baseline). You drive the loop from there.

## Rules you must not break (full detail in HANDOFF.md)

- **Never tune on the sealed `test` split.** Optimize on `dev`; validate on
  `test` only through the `TestSetGuard` budget.
- **Plausibility ≠ accuracy.** `eval/sections/structure-checks.ts` is a sanity
  gate to catch obvious errors (7 verses, etc.) — it must NEVER be folded into
  the accuracy score, or you'd be teaching the detector to fake the number.
- **Measure every change, then keep or revert it.** Keep `npx tsc --noEmit` and
  `npx vitest run` green after each change.
- **Stay scoped.** Only edit the detector
  (`services/audio-worker/lib/audio/foote-analyze.ts`) and the eval tooling
  (`eval/sections/**`). Do NOT touch auth, payments, or app routes.
- **Log + check in.** Append each iteration to
  `eval/sections/runs/handoff-log.md`; stop to involve the human at the
  checkpoints `HANDOFF.md` names (gold-labeling ~8 test songs; success/plateau).

## Everything you need is already in this repo

- **Brief:** `eval/sections/HANDOFF.md`
- **Toolkit:** `eval/sections/` — the anti-cheat grader (`grade.ts`), sealed
  split (`corpus.ts`), runner (`run-eval.ts`), parameter tuner (`tune.ts`),
  structure checks, teacher labeling (`label-with-teacher.ts`).
- **Visual runbook:** `eval/sections/runbook.html`
- **One-command human setup:** `eval/sections/setup.sh` (and the short
  `eval/sections/START-HERE.md`).
- **General repo conventions:** `CLAUDE.md`.
