# Build Brief — Vasoactive Titration Simulator (Claude Code)
### A device-fidelity, browser-based clinical simulator for the oncology ICU

This brief is written for Claude Code. It turns the clinical prompt (v3) into an executable project spec: stack, architecture, design direction, data layer, engine modules, build phases, and acceptance criteria. The full clinical/policy narrative lives in `docs/CLINICAL_SPEC.md` (drop the v3 prompt there) and the source PDFs in `docs/references/`.

---

## 1. Project intent

Build a maintainable, friendly, high-fidelity React simulator in which an oncology-ICU RN initiates and titrates vasoactive infusions exactly as ordered, documents per policy, and receives coaching. This replaces single-file artifact builds so the UI can be polished and the clinical logic can be tested. Design the shared pieces (design system, primitives, engine patterns) so the **Zoll defibrillator simulator and future device sims can reuse them** — treat this as the first app on a small internal simulator platform.

## 2. Recommended stack

- **Vite + React 18** — fast dev server, instant HMR for UI iteration.
- **TypeScript** — strongly recommended here. Typed `Order`, `DrugDefinition`, and `SimState` catch clinical-logic bugs at compile time (wrong units, missing order fields). If you'd rather move fast in JS, keep the same shapes as JSDoc typedefs.
- **Tailwind CSS** + a small set of hand-built primitives (Button, Panel, Field, Toast). Avoid a heavy component library; device screens need custom styling, not Material defaults.
- **Zustand** (or React Context + reducer) for the simulation store — one predictable state tree the engine and UI both read.
- **Vitest** for engine unit tests (titration, guardrails, scoring). The clinical rules must be tested, not eyeballed.

## 3. Repo setup — drop these in first

```
/docs
  CLINICAL_SPEC.md          <- paste the v3 prompt here (source of clinical truth)
  /references
    CP4-156.doc             <- titration & documentation policy
    CP4-156_Attachment_B.pdf<- formulary/titration table
    Alaris-System-8015.pdf  <- pump behavior (Guardrails Suite MX v9.33)
CLAUDE.md                   <- project context (provided separately)
```
Point Claude Code at `docs/CLINICAL_SPEC.md` and `CLAUDE.md` as the authoritative context. Institutional policy governs; where the reference library or general knowledge disagrees, CP 4-156 and Attachment B win.

## 4. Folder architecture

```
src/
  app/            App shell, routing between scenario intro / sim / debrief
  design/         tokens.ts (colors, spacing, type), primitives (Button, Panel, Field, Toast)
  devices/        Faithful device UIs:
                    PhilipsMonitor/   (dark monitor, waveforms, MAP prominent)
                    AlarisPump/       (channel screen, Drug Library, Guardrails limits)
                    CernerMAR/        (Begin Bag, initial rate, discontinue)
                    CernerIView/      (flowsheet band documentation)
                    OrdersProfile/    (the titratable order display)
                    InfusionsPanel/   (hanging vs infusing)
  engine/         Pure, UI-agnostic, unit-tested logic:
                    titrationEngine.ts  (validates a proposed dose vs the order)
                    guardrails.ts       (soft/hard limit evaluation)
                    physiology.ts       (vitals response to titration, with lag)
                    clock.ts            (sim time, intervals, 30-min checkpoints)
                    documentation.ts    (cadence + MAR/iView placement rules)
                    scoring.ts          (debrief scorecard)
  data/           formulary.ts (Attachment B subset, typed), scenarios/ (case configs), policy.ts (constants)
  state/          store.ts (Zustand), types.ts (Order, DrugDefinition, SimState, LogEntry)
  test/           engine unit tests
```

Keep `engine/` **pure** — no React, no DOM. It takes state + an action and returns the next state + feedback. That is what makes it testable and reusable across sims.

## 5. Design direction (the "friendlier interface" mandate)

Two visual registers, deliberately separated:

- **App shell / wrapper** — clean, warm, guided. This is where the learner is welcomed, oriented, and coached. Use your branded system (USC Cardinal `#990000` / Gold `#FFCC00`, or FORGE Navy `#1B2A4A` / Amber `#E8A020`), generous spacing, clear typographic hierarchy (Montserrat/Source Sans), a persistent header showing sim clock + current MAP + target, and non-punitive coaching surfaced as inline cards or toasts — never a wall of red text.
- **Device screens** — faithful replicas, not stylized. The Philips monitor is a dark panel with the conventional waveform colors (ECG green, ABP red, SpO2 cyan) and MAP shown large; the Alaris pump mimics the channel/Drug Library screen with soft/hard-limit alerts; Cerner MAR and iView use a light clinical-grid aesthetic. Fidelity here is the point — it should feel like the equipment.

UX principles: one primary task visible at a time; the decision → double-check → dose entry → response → documentation loop should feel like a guided flow, not a form dump. Add micro-transitions when vitals change so the learner *notices* the response. Responsive down to tablet (nurses use tablets). Accessibility: WCAG AA contrast, keyboard operable, labeled controls, no color-only signaling.

## 6. Data layer (author once, reuse everywhere)

`data/formulary.ts` — the CP 4-156 Attachment B subset, typed. Units exactly as in the policy. Include a `weightBased: boolean` and `unit` field so the engine handles both dose types.

```
Norepinephrine (Levophed)  8 mg/250 mL    start 0.5 mcg/min   titrate 0.5 mcg/min q3-5min   max 30 mcg/min     fixed
Epinephrine (Adrenalin)    8 mg/250 mL    start 1 mcg/min     titrate 1 mcg/min (per order) max 20 mcg/min     fixed
Phenylephrine (Neo-Syn.)   40 mg/250 mL   start 50 mcg/min    titrate 25 mcg/min q5min      max 200 mcg/min    fixed
Dopamine (Intropin)        800 mg/250 mL  start 2 mcg/kg/min  titrate 1 mcg/kg/min q10min   max 20 mcg/kg/min  weight-based
Dobutamine (Dobutrex)      1000 mg/250 mL start 2.5 mcg/kg/min titrate 2.5 mcg/kg/min q3min max 40 mcg/kg/min  weight-based
Milrinone (Primacor)       20 mg/100 mL   start 0.25 mcg/kg/min (titration per order)       max 1 mcg/kg/min   weight-based
Vasopressin (Pitressin)    40 units/100mL shock start 0.02 u/min titrate 0.01 u/min (interval per order) max 0.04 u/min  fixed
```

`data/policy.ts` — constants: documentation cadence points (`INITIATION`, `+30 START`, `PRE_TITRATION`, `+30 POST_TITRATION`), MAR-vs-iView placement rules, high-alert double-check requirement, restart-at-prior-rate-after-pause rule, 2-hour-off removal rule, and the emergent "Block of Charting" element list.

`data/scenarios/` — each scenario is a config object (patient, weight, admission, starting vitals, initial infusion state, the `Order` objects). First scenario: 55-year-old female, 68 kg, neutropenic septic shock; norepinephrine hanging but Begin Bag not done and rate stopped; titrate to MAP ≥ 65; add vasopressin at norepi max.

## 7. Engine modules (pure, tested)

- **titrationEngine** — given a proposed dose + current state + order, returns `{ status: 'ok' | 'off-order' | 'needs-provider', reasons[] }`. Enforces start dose, increment size, minimum interval, max, target, and agent sequence.
- **guardrails** — maps a proposed dose to `withinLimits | softLimitOverride | hardLimitBlocked` per the Alaris model.
- **physiology** — advances vitals toward target after a correct titration with a configurable lag; under-dosing yields inadequate response; at-max drives second-agent need.
- **clock** — tracks sim time; exposes whether a titration is allowed yet and whether a documentation checkpoint is due.
- **documentation** — validates that each required entry exists at the right cadence point and in the right location (MAR vs iView); flags gaps.
- **scoring** — aggregates order adherence, interval/increment compliance, sequencing, double-check completion, documentation cadence/placement, and provider-notification correctness into the debrief.

## 8. State model

`SimState`: `clockMinutes`, `infusions[]` (drug, status: hanging/infusing/stopped, rate/dose), `vitals`, `orders[]`, `log[]` (every action + documentation entry with timestamp + location), `doubleCheckFlags`, `adherenceFlags`, `phase`. The store exposes actions (`startInfusion`, `titrate`, `document`, `notifyProvider`, `advanceClock`) that call the engine and commit the returned next state.

## 9. Build phases (work incrementally; checkpoint after each)

1. **Scaffold**: Vite + React + TS + Tailwind + Zustand + Vitest; design tokens; primitives; app shell with the three phases (intro → sim → debrief) wired to placeholder screens.
2. **Data + types**: `types.ts`, `formulary.ts`, `policy.ts`, first scenario config. Unit-test that formulary entries parse and weight-based dosing computes.
3. **Device screens (static)**: Philips monitor, Alaris pump, Cerner MAR, iView, Orders, Infusions — rendered from state, no interactions yet. Get the fidelity right here.
4. **Engine**: titrationEngine, guardrails, physiology, clock — with Vitest coverage of the rules before wiring UI.
5. **Wire the loop**: decision → double-check → dose entry (Guardrails-checked) → physiology response → documentation at the cadence point → feedback. Enforce MAR-vs-iView placement.
6. **Debrief**: scoring module + Cerner-style documentation review + coaching summary, with reference-library citations where applicable.
7. **Polish + QA**: transitions, responsive/tablet, accessibility pass, and the emergent Block-of-Charting branch.

## 10. Acceptance criteria (make these tests)

- Starting an infusion before completing Begin Bag / line verification is blocked or flagged.
- Titrating sooner than the ordered interval raises a soft-limit alert and logs a deviation.
- An increment larger than ordered is flagged; a dose beyond a hard limit is blocked by the pump.
- Reaching agent 1's ordered max with MAP still < target routes to **notify provider**, not free-titration; agent 2 cannot start until that happens (unless order permits).
- Documentation is required at initiation, +30 min, pre-titration, and +30 min post-titration; a missing or misplaced (MAR vs iView) entry is flagged in the debrief.
- Weight-based drugs compute correctly against the scenario weight; fixed-rate drugs use absolute units.

## 11. Run

```
npm create vite@latest . -- --template react-ts
npm install && npm install zustand && npm install -D tailwindcss vitest
npm run dev      # iterate the UI
npm run test     # verify the engine rules
```

## 12. Reuse note

Put `design/` and `engine/` patterns behind clean interfaces so the Zoll defibrillator sim imports the same tokens, primitives, clock, and scoring shell. The device-specific parts (pump vs defibrillator) live in `devices/`; everything else is shared. That shared core is the real deliverable — this sim is just the first tenant.
