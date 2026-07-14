# Vasoactive Titration Simulator

A device-fidelity, browser-based clinical simulator for oncology-ICU RNs: initiate and titrate vasoactive infusions exactly as ordered, document per policy, get coached. First app on a shared simulator platform (the Zoll defibrillator sim will reuse the design system and engine shell).

## Start here (Claude Code Desktop)
1. Open the Claude Code Desktop app → **Code** tab → **+ New session** (Cmd+N) → **Local** → **Select folder** → choose this `vasoactive-sim` folder.
2. Set the session to **Plan mode** (so it plans before editing files).
3. Open `docs/PHASE1_KICKOFF.md`, copy the kickoff message, and paste it as your first prompt.
4. Review the plan → approve → switch to **Auto accept edits** → let it scaffold.
5. It will start the dev server in the **Preview** pane. Iterate on the shell there until it feels right, then commit and move to Phase 2.

## What's in here
- `CLAUDE.md` — project rules + non-negotiable clinical guardrails (auto-loaded every session).
- `docs/BUILD_BRIEF.md` — architecture, folder structure, and the 7 build phases.
- `docs/CLINICAL_SPEC.md` — the full clinical prompt (v3): scenario logic, documentation cadence, formulary.
- `docs/PHASE1_KICKOFF.md` — the Phase 1 (and Phase 2) kickoff messages.
- `docs/references/` — source institutional documents (governing truth):
  - `CP4-156.doc` — Administration & Titration of IV Medications policy
  - `CP4-156_Attachment_B.pdf` — IV infusion titration formulary table
  - `Alaris-System-8015.pdf` — Alaris Guardrails Suite MX pump manual

**If sources conflict, institutional policy (CP 4-156 / Attachment B) governs.**

## Tip
Run `git init` and commit after each build phase. Plan mode + per-phase commits is your undo button if a phase drifts.
