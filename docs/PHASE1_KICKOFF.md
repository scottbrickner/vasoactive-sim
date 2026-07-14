# Phase 1 Kickoff — paste this into the Claude Code **Code** tab (in Plan mode)

```
You're building the Vasoactive Titration Simulator described in this repo.

First, read these before writing any code:
- CLAUDE.md (already loaded) — the project rules and non-negotiable clinical guardrails.
- docs/BUILD_BRIEF.md — the architecture, folder structure, and build phases.
- docs/CLINICAL_SPEC.md and docs/references/ — the clinical source of truth. Institutional
  policy (CP 4-156 and Attachment B) governs if anything conflicts.

This session is PHASE 1 (Scaffold) ONLY:
- Initialize a Vite + React 18 + TypeScript project with Tailwind CSS, Zustand, and Vitest.
- Create the design token system (src/design/tokens.ts) and base primitives (Button, Panel,
  Field, Toast) for the friendly, branded APP SHELL. Use USC Cardinal #990000 / Gold #FFCC00
  for the shell palette. (Device-screen fidelity is a later phase — not now.)
- Build the app shell with three phases wired to placeholder screens:
  Scenario Intro -> Simulation -> Debrief, plus a persistent header showing sim clock,
  current MAP, and target (placeholder values are fine).
- Do NOT build the clinical engine, device screens, clinical data, or scenarios yet.
  Those are Phases 2-7 in the brief.

Before creating any files, give me a short plan:
1. the exact dependencies and versions you'll install,
2. the file tree you'll create,
3. the design tokens you propose (colors, type scale, spacing).
Wait for my approval before scaffolding.

After I approve and you build it, STOP at the Phase 1 checkpoint: start the dev server, confirm
it builds, and show me the shell in the preview so we can lock the look and feel. Do not start
Phase 2.
```

## Phase 2 kickoff (next session, after Phase 1 is approved and committed)

```
Phase 1 is approved and committed. Proceed to PHASE 2 (Data + types) from docs/BUILD_BRIEF.md:
create types.ts, formulary.ts (the Attachment B subset), policy.ts, and the first scenario
config, with Vitest tests confirming weight-based dosing computes correctly. Stop at the
Phase 2 checkpoint.
```
