# CLAUDE.md — Vasoactive Titration Simulator

Persistent context for Claude Code. Read `docs/CLINICAL_SPEC.md` (the full clinical prompt) and the PDFs in `docs/references/` before changing clinical logic.

## What this is
A device-fidelity, browser-based clinical simulator for oncology-ICU RNs: initiate and titrate vasoactive infusions exactly as ordered, document per policy, get coached. First app on a small shared simulator platform (the Zoll defibrillator sim will reuse the design system and engine shell).

## Source of truth (in priority order)
1. `docs/references/CP4-156` — Administration & Titration of IV Medications policy (documentation cadence, order elements, provider-notification, Block of Charting).
2. `docs/references/CP4-156_Attachment_B.pdf` — formulary/titration table. Values apply "unless defined by prescriber."
3. `docs/references/Alaris-System-8015.pdf` — pump behavior (Guardrails Suite MX v9.33: Profiles, Drug Library, soft/hard limits).
4. CST Cerner (https://cstcernerhelp.healthcarebc.ca) — MAR "Begin Bag" and iView conventions.
5. The educator's reference library — supplemental evidence/templates only.
**If sources conflict, institutional policy (1–2) governs.**

## Non-negotiable clinical rules
- Verification is per-`DrugId`, via `data/policy.ts`'s `MEDICATION_VERIFICATION` (Phase 19d): vasoactives, dexmedetomidine, and diltiazem are NOT designated high-alert at this institution — no independent (two-nurse) double-check is required for them. Fentanyl (like propofol/midazolam/ketamine, out of scope so far) IS high-alert and DOES require an independent (two-nurse) double-check before programming, on top of the BCMA/I-TRACE check every drug gets. BCMA verification against the order and I-TRACE line-tracing happen once, for every drug, when the starting dose is programmed — covering both the bag and the dose in a single comprehensive check, performed by the administering nurse alone (Phase 12d correction: Begin Bag itself is ungated — it hangs the bag and charts in MAR, but doesn't pop its own verification; a real nurse verifies once, not twice, right before starting the infusion). Titration of an infusion that's already hanging and verified, restarting after a pause, and discontinuation are NOT separately gated (Phase 8a correction: the original "and each titration" text didn't match real bedside workflow) — this applies to the independent double-check too: initiation-only, never re-required at titration.
- Both initiating a starting dose and titrating auto-advance the sim clock by the order's own interval — the pump doesn't know or care which kind of dose-change just happened (Phase 12d: initiating used to leave the clock untouched, requiring a manual advance before the next action was even possible).
- Documentation cadence: initiation, +30 min after start, before each titration, +30 min after each titration.
- Placement: Begin Bag + initial rate in MAR; subsequent titrations in iView; discontinuation in MAR.
- Never present an unsafe or off-order action as correct. Off-order-by-error → corrective feedback. Clinically needed beyond the order (e.g., at max, still hypotensive) → notify provider before proceeding.
- Handle both fixed-rate (mcg/min, units/min) and weight-based (mcg/kg/min) dosing correctly.
- Norepinephrine in this formulary is dosed in mcg/min, NOT weight-based.

## Stack & conventions
- Vite + React 18 + TypeScript + Tailwind; Zustand store; Vitest for engine tests.
- `engine/` is PURE (no React/DOM): `(state, action) => { nextState, feedback }`. Everything clinical is unit-tested.
- Two visual registers: friendly branded app shell vs. faithful device replicas. Don't stylize the device screens.
- Accessibility: WCAG AA, keyboard-operable, no color-only signaling. Responsive to tablet.

## Definition of done for any change
- Engine changes ship with Vitest coverage.
- Clinical behavior matches the acceptance criteria in `docs/CLINICAL_SPEC.md`.
- No hard-coded clinical values in components — read them from `data/formulary.ts` and the scenario config.

## Commands
- `npm run dev` — iterate UI
- `npm run test` — verify engine rules
