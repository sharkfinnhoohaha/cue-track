# Start here — section detection (the short version)

You want the detector to find verses/choruses/etc. accurately. Here's literally
all you do. No theory required.

## Your 3 steps

1. **Put 25–50 songs** (mp3 or wav) in a folder called `corpus/audio/` in this
   repo.

2. **(one time) log in to Google Cloud** so the script can deploy the AI model:
   ```
   gcloud auth login
   ```
   (Don't have the `gcloud` command? Install it: https://cloud.google.com/sdk/docs/install — or, if the model is already deployed, just set `ML_WORKER_URL` and `ML_WORKER_SHARED_SECRET` and skip this.)

3. **Run the one script:**
   ```
   bash eval/sections/setup.sh
   ```
   It installs everything, deploys the AI model (asks first — the first build
   takes ~30 min), labels all your songs automatically, and prints a baseline.

That's it. You're set up.

## Then — let an agent take it the rest of the way

Open this repo in **Antigravity** (or Claude Code) **on the same machine**, and
paste this:

> Read `eval/sections/HANDOFF.md` and execute it. Drive section detection to ≥90%
> honestly, keep tsc + tests green, only edit the detector + eval tooling, and
> stop to involve me at the checkpoints it names.

It runs the improvement loop on its own and only comes back to you to grade a
batch (or when it's done). **Or** just paste me (Claude) the numbers the script
printed and I'll tell you the next move.

## The only thing you might do later

For a fully trustworthy "90%", you'll hand-correct **~8 songs** at some point —
the agent tells you exactly which ones and it takes ~15 minutes. You do **not**
need to do this to get started.
