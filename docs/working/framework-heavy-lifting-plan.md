# Framework Heavy-Lifting Plan

Status: Active
Status detail: t828 Core and affected web/Lab tests/types/builds pass; installed browser rerun active after setup locator fix. Private0.20/main0.19; no full/paid calls.
Created: 2026-10-28
Last updated: 2026-10-31
Owner: framework-heavy-lifting sub-supervisor (for the lead supervisor)
Scope: Every responsibility Core's model-facing loop leaves to the model, classified as semantic (model), computable or enforceable by Core for any client environment, or client-specific; with the generic contract each client would supply.
Paired document: ../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan.md (web-specific parts)
Related: downstream evidence reports in ../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/ (fhl-debug-notes, fhl-step-workload, fhl-core-surface, fhl-domain-surface)

## Current State

**Active t828, 2026-10-31:** Core0.20 independently accepted122tests/14files, typecheck, full audit and compiled SDK smoke; imports ratchet removed1 old violation, baseline1143. All three private SDK libraries current. Down domain source/tests types and build pass after optional-field/copy fixes; first selection142/143 passed, all corrected/additional91 pass and final18 fixture/contract tests pass; native16 rerun passes. Extension84owning tests/typecheck/build and Lab typecheck/build/four trace-reader tests pass. Source/producer/identity APIs frozen. Installed browser attempt1 paired/captured/declared the real target, then test locator reselected a different visible record after Hide, before any Core action; lead pinned the fixture container key and attempt2 is running. No browser acceptance yet. Real proof uses genuine hidden-target commands plus explicit same-post re-observation after Undo, never manufactured failures. Reports p8-identity/ in private Core; artifacts ignored. Parent dev Coreceb14f8f/downstream1830d9ab pushed, main source/SDK stays0.19 until integration. Full sweeps2used/main held; Claude/$5 configured, no paid go/API calls/panel management; user clinerules unchanged.

Settled settled clock and catalog state is preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

**User decision, 2026-10-30 (P5b).** A judge rejection whose every reason Core refutes from the run's own evidence may
pass without a model yes, after the judge has been re-prompted with that evidence. Missing or unusable rechecks and
unrefuted new defects must not pass. This does not authorise bypassing the judge for arbitrary computed results.

**Executing, 2026-10-30.** P0, the per-pass act ledger, P4, P5a, P7, P1a and repair-from-step are merged. P6 t799 is
also merged after lead verification (235 owning Core tests, affected types, final audit and 70 merge-contract tests;
native installed-extension proof in the paired repository). P5b, P1b and t817 are merged (t817: Coreae354e9d/downstreamdf58a48e); native grounded-state oracle/replay passes. Paired t816 is merged and pushed:
Claude runtime, keys/settings UI and live-test routing with the user's $5 whole-build allowance; no paid run has started.
Sweep2 on Core803f3c81/downstream16dd9ad3 found six recovery tests and one SQL repair/replay test with zero fake-provider calls. Policy IDs and the legacy host sentinel reached strict provider validation; recovery also dropped explicit model/key metadata. Task t819 repairs caller propagation and legacy compatibility without weakening provider binding or key custody; lead217 focused tests, types and full structure audit pass. The rest of this section is the plan as written.

The audit ran 2026-10-28 at the user's direction: make
Core do the heavy lifting the build model now carries, for any client environment (web, desktop, mobile, API). Eleven
reports were synthesised into this document. The synthesis, the contradictions it resolved and the source it checked
are in [reports/fhl-synthesis.md](framework-heavy-lifting-plan/reports/fhl-synthesis.md). The web-specific half (which
domain and extension files fill each contract below, and moving web concepts out of Core) is in the paired document,
`C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan.md` (the web extension repository).

Reports: Core area audits in `framework-heavy-lifting-plan/reports/` (`fhl-core-build-tools`,
`fhl-core-grammar`, `fhl-core-trials-resets`, `fhl-core-judging`, `fhl-core-runtime`, `fhl-core-data-supervisor`,
`fhl-core-client-seam`). Downstream evidence in `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/`
(`fhl-debug-notes`: eight debug notes; `fhl-step-workload`: one passing build measured step by step; `fhl-core-surface`;
`fhl-domain-surface`).

### What is true

- **The model is rarely what decides a run.** In 8 of 8 debug-note runs the deciding defect sat in something Core holds
  or could compute. In 3 (social group-posts runs mvskodlp, mvswewhy, mvrj-c20c) the Flow already matched the Lab
  oracle and a judge's false no lost the run. In 3 more (mvrj-6916, mvrj-b6dc, mvrj-a44a) Core's own undo and reset
  bookkeeping gave answers that contradicted each other or that no call could meet, and the build ended Blocked with no
  Flow. One (mvswh11y) was a false pass that the quote guard let through. A ninth run (crossborder cart, mvswhobv) ran 0
  of 11 trials: the trial door refused every one for a witness no call could supply.
- **Dollars are small; calls and time are the levers.** Baseline from the measured everything-store checkout build
  (run-mvsknffp-153bc89a): 104 decides plus 14 judges, $0.086, 248 s of model time in a ~697 s build window. Trials and
  node runs are ~418 s (60%) of the window. The largest single waste (~46 decides, about 45% of model spend) was a
  builder chasing a trial-door witness that its press could never have. That was not a model error.
- **Core already has the right patterns:** it auto-writes `ensureState` and explored-layer handlers, re-finds stale
  targets from their source step, proves trial changes against before/after witnesses with a graceful `unproven`, and
  refutes judge nos from its record. The plan extends these patterns and adds no parallel paths.
- **Core holds client concepts it should not.** These are 56 `web.*` lines in the model-facing script format, English
  word lists that refuse or classify, a `dialog` handler fact, closed web layer kinds and DOM fingerprint fields. None
  blocks a web run today. Together they block a non-web client.
- **Model-facing text breaks the teaching-to-the-test rule in places.** Judge and run-node text carries
  scenario-shaped examples (an item "including an excluded part", "opens checkout", cart/coupon/store start states, a
  membership relation shaped like joined groups). Phase P0 removes them before any measurement.

### Top recommendations (ranked by effect on live pass rate, then cost and time)

1. **Judge only the semantic residue (Finding F1, phase P5).** Core settles count, columns, duplicates, verbatim cells,
   kept-row bounds, typed effects and unchanged places before any judge call. A failed computed check is a Core no
   that locates its defect. A no the judge cannot ground never fails a run. A model yes is still required to pass.
   Expected effect: up to 3 of 8 debug runs flip to pass, and the false pass becomes an honest fail.
2. **One truthful answer from undo and reset (F2, P4).** One function answers "is this act's control back at its
   place" for both admission and settlement. Stale in-place reads are never judged. Every act to undo either has an
   admissible call or is closed as unsettleable. Undos pair with their acts from client effect records. Expected
   effect: 3 Blocked runs unblock, with 1 to 2 of 8 likely to pass.
3. **An honest trial door (F3, P2 then P3).** Admit a trial as `unproven` when no witness is reachable. Compute
   `canMeet` truthfully. List only reachable references. Add region, value and landing witnesses. Stop a brief that
   meets the same unmet requirement 3 times. Expected effect: about $0.03, 70-90 s of model time and 140-160 s of wall
   clock per build like the measured one. The crossborder cart build goes from 0 trials run to judged trials.
4. **Fold bookkeeping turns (F6, P1).** Refuse an unknown tool id and ask again instead of ending the brief. Make
   revision and digest optional, test on submit, complete automatically on a yes, default the brief fields. Expected
   effect: 20 decides, $0.0131 and 41 s on the baseline, and one avoidable Blocked path removed.
5. **Layer-centred interruptions and toggles (F4 and F5, P6).** The dormant `clear_interference` rung runs from a
   client-reported obstruction. Learned handlers are scoped by layer, not by step. Handlers also come from trial
   interruptions. Toggle `ensureState` and a witness per pass come from trial presses. Expected effect: the photo-social
   likes failures (1 decisive, 2 contributing).
6. **Grammar the requests need (F7, P7).** Add date bounds (the reader already exists), per-item marks and typed fields,
   so relation-defined sets stop being literal lists. This is mainly about generality, and it removes the material
   behind the false nos.
7. **Append-only evidence and batched identical re-runs (F8, P9).** Expected effect: about $0.012 and 37 s per build.
8. **Move client concepts behind contracts (F10, P10).** Required before any non-web client. No change to web runs.

On the measured build, recommendations 1, 3, 4 and 7 together give an estimated ~48 calls instead of 118, ~$0.030
instead of $0.086, ~100 s of model time instead of 248 s, and a ~480 s window instead of ~697 s. This is inference: the
arithmetic is under F1, F3, F6 and F8, and it assumes the remaining calls decide as they did.

### What is next

Phase P0, a small text-only unit, goes first. Then five lanes run in parallel, partitioned by file. Phases inside a
lane are serial:

| Lane | Phases (in order) | Owns (Core paths under `packages/fluxiq/src/programs/automation-studio/runtime/` unless noted) |
| --- | --- | --- |
| A, build loop | P1, then P9 | `llm/evidence-loop*`, `llm/context-window.ts`, `llm/decision-context/`, `llm/node-tools/`, `flow-bootstrap/subflow-candidate/`, `flow-bootstrap/candidate/` (except trial-gate `cannotUndo`), `project-agents/supervisor/dispatch-tool.ts`, `brief-input.ts`, `project-agents/dispatch/`, `project-agents/single-subflow/`, `activity/`, `service/project-build-ending/` |
| B, site state | P2, P3, P4 | `flow-bootstrap/site-reset/`, `reset-admission/`, `reset-settlement/`, `trial-change/`, `llm/evidence-progress/`, trial-gate `cannotUndo` |
| C, judging | P5 | `result-verification/`, `llm/diagnosis-instructions.ts`, `llm/deepseek/output-schema.ts`, `project-agents/supervisor/tools.ts` (`answer.rows`, `effect`), `service/candidate-trial/feedback.ts` |
| D, runtime | P6, then P8 | `executor/`, `service/runtime-session/`, `flow-bootstrap/layer-handlers/`, `script-statements/toggle-idempotent.ts`, `llm/repeat-guard/retry-later.ts`, `recovery/in-run-repair/` |
| E, grammar and seam | P7, then P10 | `packages/contracts/src/record-sets/`, `flow-bootstrap/plan/`, `script-statements/` (except toggle-idempotent), `authoring/`, `instructed-acts/`, `answerability/`, `model/`, `fingerprinting/` |

- The paired document's W-phases fill each phase's client contract. A phase with a client contract is a Core-paired
  task, and its Core default (today's behaviour) ships first, so Core never waits on the client.
- The downstream Lab reporting fix (paired W0) should land before the first live round. The Lab now reports "judged
  unknown" or `performance.budget` where Core's record says otherwise (5 of 8 runs). That hides the product cause each
  phase is meant to change.
- Validation follows the full-suites-twice-a-day rule. Each phase names only the narrow tests beside its subjects,
  the package typechecks and the structure audit. Live checks are batched into rounds after the round's phases merge
  and lane trees sync. A round runs one task per affected scenario, on the ten realistic scenarios only.

### Blocked, unverified, open

- Nothing is blocked.
- Unverified premises that the first unit of a phase must settle:
  - P2: whether a yes can complete a part whose proof is `unproven`.
  - P3: whether the web domain fills `values` and `differs` for a non-list region.
  - P7: whether `read-number.ts` keeps a minus sign, and whether every field has per-item values for the
    discriminating-field hint.
  - P1 and P2: N=3 for the dead-requirement stop, to be set by replay of recorded traces.
- Every effect figure is one-run arithmetic or a reading of the debug notes. None was measured or prototyped.
- Open questions with owners are at the end of this document.

## Findings

Ranked by expected effect on live pass rate, then cost and time per build. Evidence notation: report name; Core paths
are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`; run steps are step-directory numbers. Unit
costs from fhl-step-workload: decide $0.000724 and 1.93 s mean (late, larger packets about $0.0008); judge first ask
about $0.0014, its cached twin $0.0003, 3.4 s mean; `core.run_node` 3.58 s mean (182.5 s / 51).

### F0. Rule breach: model-facing text mirrors realistic scenarios (fix first, outside the ranking)

- Evidence: fhl-core-build-tools "Catalog and instruction text":
  - `llm/diagnosis-instructions.ts:171`: "an item sold with or including an excluded part is still the item" (the
    shape of the mvswh11y earbuds and ear-tips false pass); "a count, an item in a cart, a collected coupon, a chosen
    store"; the "search query ... title" and "a numeral may describe only one component" sentences.
  - `llm/node-tools/run-node.ts:90`: "opens checkout ... submits the post".
  - `flow-bootstrap/plan/evidence-schema.ts:115`: an act list.
- fhl-core-grammar adds "Garden Club" (`flow-bootstrap/plan/flow-script-format.ts:466,473`) and the judge's "books I
  have on loan ... Return button", a membership relation shaped like the joined-groups task (`diagnosis-instructions.ts:171`).
- Effect: no pass-rate figure. While these stand, a Lab pass partly measures a taught answer, which the binding rule forbids.

### F1. The judge decides questions Core can settle, and flips on identical prompts

- Evidence:
  - fhl-debug-notes classes 2 and 3. mvskodlp 0058/0059, mvswewhy 0055/0056/0059 and mvrj-c20c 0052/0053, 0070-0073
    and 0078-0081 were false nos on oracle-correct Flows. mvswh11y 0032 invented an exclusion; its correct no (0041) was
    refuted on a misread count (D2), and later yeses passed the quote guard by lending and a column alias (D3).
  - The judge is asked about 20 questions per reply, about 12 of them computable (fhl-core-judging table rows 1, 3-7,
    10, 11, 13-16).
  - Core settles only left-out rows (`result-verification/value-readings/settled-rows.ts`, checked).
    `result.unasked_change` is "information for the judge ... never a verdict"
    (`result-verification/contracts/run-result-summary.ts:148-156`, checked).
  - Byte-identical temperature-0 prompts flipped: mvswewhy 0057 yes, 0059 no, 160,796 bytes, empty diff.
  - A judged no is re-asked with byte-identical evidence by design (`result-verification/agreement/ask-again.ts:59-62`,
    `result-verification/verify.ts:270-279`, checked), so the second ask is a correlated draw (cache hit, $0.0003), not
    an independent check.
- Effect on pass rate: of the 8 debug runs, 3 had oracle-correct Flows lost to ungrounded nos. With grounded checks
  those nos cannot fail the run. Upper bound +3 of 8 (+37 points). Realistic +2 of 8 (+25 points), because a pass still
  needs a model yes on the semantic residue. mvswh11y becomes an honest fail through the quote guard (own sentence, own
  quote, no column alias) and the items-seen versus stored-count fix.
- Effect on cost (measured build): the judges were $0.0106 and 47.3 s. Three value-shape defects (steps 189, 198, 228:
  total `$0.00` versus `$7.59`, a cell holding extra text, an address cell missing a name) are computable as "the cell
  is not one element's verbatim text". A check that fails before the judge saves 3 pairs, and dropping the twin of each
  grounded check saves the rest. 14 judges become about 4: about $0.005 and about 30 s.

### F2. Undo and reset bookkeeping contradicts itself or cannot be satisfied

- Evidence:
  - fhl-debug-notes class 1: decisive in 3 runs, contributing in 1.
  - mvrj-a44a: a 110-step livelock (0103-0204). Settlement said "press back" while admission said
    `undo_already_back`, because `controlOriginal` was filed under a place token that embeds the page address.
  - mvrj-b6dc 0177/0227: a list read in place after an undo counted 3 removals against 2 unspent acts, so every act
    became `no_admissible_undo`.
  - mvrj-6916 0157/0169: a reloading `modify_existing` press had no witness, no admissible inverse and no honest exit.
    The repeat guard ended three briefs.
  - fhl-core-trials-resets lists the codes no call can meet (`candidate.undo_unproved`, `reset_target_unidentified`,
    `trial_starts_in_end_state` when its act is unsettleable).
- Effect on pass rate: 3 of 8 runs unblock. mvrj-b6dc's subflow trials were already judged yes twice (0181/0182,
  0209/0210), so it is likely to pass. mvrj-6916 (office address never chosen, 0034/0038) and mvrj-a44a (pinned posts
  taken as newest, 0033-0035) still need model fixes. Expected +1 to +2 of 8.
- Effect on cost: mvrj-a44a spent 110 steps in the livelock, and the three runs spent their purses without producing a Flow.

### F3. The trial door demands a witness it cannot get, and says it can

- Evidence, checked in source:
  - `flow-bootstrap/site-reset/project-reset.ts:136-141` (`admitted`) refuses every reversible lasting step whose stamp
    does not resolve, always with `canMeet: "another_page"`.
  - Witness kinds are closed (`flow-bootstrap/reset-admission/witness.ts:24-29`: destination, own list, control,
    repeats, legacy).
  - A navigation-only press can be witnessed only by "a witnessed explored press it repeats", which never exists
    (fhl-core-build-tools finding 2).
- Run evidence:
  - The measured build had 8 straight `candidate.trial_step_unwitnessed` refusals (steps 0025, 0035, 0039, 0061, 0089,
    0099, 0142, 0152). Builder 3 then met the gate with a fiction: it named the cart list, which the task leaves
    unchanged, as the place the press's effect shows (0147, 0155, 0163).
  - mvswhobv: 0 of 11 trials ran, and $0.199 of the $0.25 purse went on a search that could not succeed.
- Why it ran so long, checked: `llm/evidence-progress/no-progress.ts:43-47` counts a call that reaches an unseen page as
  progress, and `refusedAgain` forgets on any new signature (`:177-181`). A builder that moves across pages while it
  chases one unmet code never trips the stall guard (fhl-core-data-supervisor S4).
- Effect on cost (measured build): steps 26-118 hold 46 decides (21 re-runs, 8 first runs, 4 submits, 5 tests, 5 looks,
  1 refused repeat, 2 supervisor). About 7 first runs would be redone anyway, so 35-46 decides are saved: $0.028-0.037
  at $0.0008 each, and 68-89 s of model time. Node time saved: 19 re-runs at 3.58 s is about 68 s. Wall clock: −136 to
  −157 s of 697 (−20 to −23%).
- Effect on pass rate: mvswhobv goes from no trial to a judged trial (it is not one of the 8). mvrj-6916's door
  refusal is removed too, and it overlaps F2.

### F4. Interruptions are learned per step, after the fact, and the clearing rung is dormant

- Evidence:
  - fhl-core-runtime findings 1 and 2: the run-time handler is scoped to one node
    (`service/runtime-session/interruption-handler.ts:46`), and its condition is the web fact `LAYER_FACT = "dialog"`
    (`:40`, checked).
  - Nothing in Core or in the web domain or extension writes `clearsInterference`. Grep over both repositories found
    only readers in `executor/ladder-run.ts`, `executor/lifecycle/*` and `model/validation/flow.ts`. So a covered target
    skips straight to retry.
  - Handlers come only from layers closed while exploring (`flow-bootstrap/layer-handlers/explored.ts`). Trial
    interruptions reach the model as text.
  - mvskptb1 (decisive): playback met a dock the build had collapsed once, no handler covered it, and the in-run
    repair failed (0045/0046, 0143/0144). mvrj-6916 cause 2: a chat was "closed" by pressing its launcher toggle (0041).
- Effect: 1 of 8 decisive, 1 contributing. mvswh11y shows that model-free recovery handled both its dialogs, so the
  mechanism works once it is fed.

### F5. Toggle state is guarded only for explored toggles, and one witness covered three passes

- Evidence:
  - `flow-bootstrap/script-statements/toggle-idempotent.ts` writes `ensureState` only for presses tied to an explored or
    trial toggle (fhl-core-grammar row 7).
  - mvskptb1: the like step had no `ensureState`, and one witness stood for 3 passes, so the judged run un-liked an item
    and both judges said yes (0119, 0126).
  - Waits for the text "Unlike" when the state lives in the accessible name (mvskptb1 0055, mvrj-a44a 0092).
- Effect: removes one false judged pass and contributes to the photo-social likes runs (3 runs touched).

### F6. The build loop makes the model echo state Core holds

- Evidence, checked in source: an unlisted tool id ends the whole loop (`llm/evidence-loop.ts:748`,
  `llm_evidence_loop.unknown_tool`), while every other unusable decision is refused and asked again. This ended
  builder 2 at step 0115 (`core.describe_element` for `web.describe_element`).
- Other echoes:
  - The revision and digest pair is required on every test (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts:436-440`),
    though Core already returns the latest (`:491-504`).
  - The completion `{subflowKey, revision, digest}` is required after a yes (`flow-bootstrap/subflow-candidate/builder-loop.ts:188,280-299`).
  - Brief fields `parts`, `kind` and `failingReceipt` are copied whole (`project-agents/supervisor/dispatch-tool.ts:318,349`).
- Effect on cost (measured build): fhl-step-workload's firm class is 20 decides (12 test-after-submit, 2 complete, 1
  unchanged redispatch, 5 refused repeats), $0.0131 and 41 s. Of these, 12 fall outside F3's window (6 tests, 2
  completes, 4 refused repeats at steps 202-208): $0.0078 and 25 s. The unknown-tool refusal saves brief 2 (4 calls,
  $0.0024) and 2 supervisor re-briefs. Its larger value is that one Core defect can no longer end a build Blocked.

### F7. The grammar cannot say dates, relations or marks

- Evidence:
  - The `where` vocabulary has 4 number bounds, presence, 4 text tests, `equals` and `not`
    (`packages/contracts/src/record-sets/process/processing-vocabulary.ts:20-29`). Core's date reader
    (`read-date.ts:60`, absolute and relative forms, takes `now`) is used only for sorting.
  - mvswewhy wrote `posted matches "(19|20|21) September 2026"`, which drops later dates. mvskodlp's pattern admits
    "31 September" and every 2027 date.
  - mvskodlp and mvswewhy kept a literal 3-group list copied from a judge's "e.g." (mvskodlp 0033, 0038; mvswewhy
    0035), even after Core's t785 advisory note. Every false no then argued from that list.
  - The counter-case, mvrj-c20c 0049, used a per-row sign and still got a false no, so the deciding failure there is F1.
- Effect: generality. These Flows are correct today and wrong tomorrow, and no oracle sees that. Fixing it removes the
  arguments behind the F1 false nos in 3 runs. Not decisive alone.

### F8. The evidence packet churns the cache, and identical re-runs cost a decide each

- Evidence:
  - Old entries are rewritten when a newer view replaces them. This is design B1 of 2026-10-01
    (`llm/context-window.ts:16-25`, checked), and the packet diffs confirm it (0046 to 0048 at character 213, 0064 to
    0066 at character 3387; fhl-core-build-tools finding 4).
  - Excess cache-miss tokens: 161k, $0.024 at most and about $0.012 realistically.
  - 34 soft re-runs, of which two thirds (22) are identical: $0.0171 and 37 s.
  - The static schema rides on every builder call (26.7k characters) but costs about $0.002, which is negligible.
- Effect: after F3 removes the dead-brief window, about 9 identical re-runs remain ($0.0068, 15 s), and append-only
  history saves about $0.006 on top.

### F9. Run-time robustness rests on model self-reports and late re-finds

- Evidence:
  - "Lasting" is the model's `consequences` (`executor/defensive/lasting-act.ts:54`).
  - Re-acquire runs only for bound targets and only before attempt 4 (`executor/target-reacquire/before-attempt.ts`,
    checked), after about 3.25 s of backoff.
  - Pace is learned only from a wait hint (`executor/pacing/pace-keeper.ts`).
  - Transient faults are read from English message text (`llm/repeat-guard/retry-later.ts:7`,
    `executor/defensive/thrown-error.ts:43,214`).
- Effect: no debug run was decided by these. They cover robustness (lane D round 12 pacing; the t359 lost
  acknowledgement) and portability.

### F10. Client concepts in Core

- Evidence (fhl-core-client-seam section 3, checked where marked):
  - 56 lines of `web.dom.*` and `web.browser.*` in `flow-bootstrap/plan/flow-script-format.ts` (grep, checked).
  - English lists: `script-statements/way-out-steps.ts:71-75` (accepting words), `instructed-acts/kind-words.ts:4-11`
    (cart, coupon, bid), `answerability/instruction-ask.ts:50-57`, `executor/step-skip/act-not-done.ts:26`.
  - The `dialog` fact (`script-statements/fact-condition.ts:95`).
  - Layer kinds `consent|rate_limit|promotion|assistant|dialog` (`executor/node-execution/cleared-layer.ts:13`, checked).
  - DOM fingerprint keys and weights (`model/action-element-target.ts:6-30`, `fingerprinting/element-fingerprint.ts`).
- Effect: none on web pass rate. They are required before a desktop, mobile or API client. `way-out-steps.ts` can
  refuse a non-English close control the model cannot fix.

### F11. Lab reporting hides the product cause (downstream; paired document W0)

- Evidence: fhl-debug-notes class 11, in 5 of 8 runs. The Lab's `chatDraftVerdict` reads Core's prose, so every
  project-mode draft reads "judged unknown". A 3% token under-estimate became `performance.budget` and hid a playback
  failure.
- Effect: no product change, but every phase above is measured through this report.

## Responsibility map

Class: (a) the model; (b) Core computes, enforces or defaults, with the client contract named (CC = client contract,
K = Core-internal contract, both in the next section); (c) client-specific. "None" means Core needs no client input.

| # | Responsibility the model holds today | Class | Core's share and contract | Phase |
| --- | --- | --- | --- | --- |
| 1 | Split the request into parts, quoting the person's words | a | Core checks quotes, overlaps and dropped words (exists) | none |
| 2 | Type each part's answer columns | a | Core defaults the record schema, `process.columns` and dedupe from them (K5, CC3) | P7 |
| 3 | Read row-count asks ("three newest", "at most 5") | a reads; b compares | `answer.rows` on the part, quote-bound; Core compares stored rows (K2) | P5 |
| 4 | Type the effect of a lasting part | a reads; b defaults | Core defaults `direction`/`count` from the quote, never refuses (K3) | P5 |
| 5 | Dispatch and complete a one-subflow plan; brief `parts`, `kind`, `failingReceipt`; lower an allowance | b | Derived from the plan and the last return (none) | P1 |
| 6 | Re-brief a builder stopped by a Core-caused code | b | One automatic restart for `unknown_tool`, unreadable replies and provider codes (none) | P1 |
| 7 | Name a tool id that exists | b | Refused and asked again with the offered ids (none) | P1 |
| 8 | Choose a target for a first run; what to look for | a | Stale re-find exists; widened in P8 | none |
| 9 | Re-run a node already run with identical parameters | b | `core.run_nodes`, non-lasting only (none) | P9 |
| 10 | Declare `consequences` per press | a raises; b floor | Union of model, declared action class (CC12) and observed effect (CC4); never lowered | P3, P8 |
| 11 | Name where a press's change shows (`resetDestination`) | b | Core finds it from region, value and landing readings (CC4, CC5, CC6) | P2, P3 |
| 12 | Name the act an undo reverses (`undoes`) | b | Paired by inverse effect on the same witness (CC4 `inverse`) | P4 |
| 13 | List `cannotUndo` | b | Defaulted from the reset's own acts; the model may only narrow (none) | P4 |
| 14 | Resend a trial after a refused condition is met | b | Core keeps the pending trial and reruns it (none) | P2 |
| 15 | Write steps, order, nodes, bindings, parameters | a | Fingerprint and reachability checks exist | none |
| 16 | Conditions for a set defined by a relation | a meaning; b evidence | Marks testable in `where` (CC2); a discriminating-field note from detection samples (CC1) | P7 |
| 17 | Date bounds | b | `after`, `before`, `onOrAfter`, `onOrBefore`, `within` (K1) | P7 |
| 18 | Number versus text test on a numeric column | b | Refused once when CC1 types the field numeric | P7 |
| 19 | Put `where` on the listing of a lasting repeat | b | Core moves `process.where` onto the listing (none) | P7 |
| 20 | Paging loop for a whole collection | a when unknown; b when reported | Core adds or requires it when the list packet reports `continues` and a next control | P7 |
| 21 | Dedupe key | b | Defaults to CC3 `rowIdentity`, else whole row (exists) | P7 |
| 22 | Handlers for interruptions met in exploration, trials or run | b | From obstructions (CC7) with non-committing dismiss controls | P6 |
| 23 | `optional:` on a dismiss step | b | A step whose target is a layer's dismiss control (CC7) | P6 |
| 24 | `ensureState` and toggle direction | b | From explored and trial presses and CC9 `stateful`/`state` | P6 |
| 25 | `done when:` on committing steps | b | From the press's recorded change (exists as `landed-acts.ts`) | P6 |
| 26 | `repeat pace:` | b | From a `rate_limit` signal with or without a hint (CC8) | P6 |
| 27 | Fix a grammar slip after a refusal | a fix; b points | First `unchanged_after_no` returns the diff and the fix point (none) | P1 |
| 28 | Copy revision and digest; test after submit; complete after yes | b | Latest by default; `test` on submit; completion on a yes for the latest (none) | P1 |
| 29 | Judge row count, columns, duplicates, verbatim cells, kept-row bounds, sort, repeat passes, typed effects, unchanged places | b | Computed facts before any judge call (K4; CC1 for normalisation) | P5 |
| 30 | Judge whether a quoted exclusion really excludes a row | a | Core guards the quote: own sentence, own quote, no column alias | P5 |
| 31 | Judge the kind of item, what quantity means, act-clause meaning, an untyped relation, the converse | a | Asked as narrow questions over cells | P5 |
| 32 | Which of the person's targets (home or office address) | c | A typed target from the client where it has one; else the judge (a) | P5 |
| 33 | Repair a true failure at run time | a | Given the record Core already holds (P8) | P8 |
| 34 | Whether an act lasts (retry safety) | b | Floor from CC12 `commit`; the model may raise | P8 |
| 35 | Re-find a stale literal target | b | Re-find by identity at attempt 2 (CC: `reacquireTarget` without a source step) | P8 |
| 36 | Read transience from failure text | b | `transient` on the failure record (CC8); English regex stays only as a fallback inside the client | P8 |
| 37 | One chat reason line per decision | a for choices; b for folded steps | Core writes the line for steps it folded; every step still shows a reason | P1 |
| 38 | Ending reason for a successful build | b | Composed from the record (none) | P1 |
| 39 | Node ids, medium words and examples in the script format | c | Supplied by the client's `systemInstructions` and node descriptions (CC13) | P10 |
| 40 | Act-kind and accepting-word vocabularies | c | Client `actVocabulary` (CC14) and control `intent` (CC11) | P10 |

## Client contracts

Rule for every contract: every field is optional. An absent field reads as `unknown`, which is today's behaviour, and
never as false, failed or refused. A malformed value is dropped the way `parseAutomationStudioFailureRecord` drops one.
New data rides inside an existing read or record where one exists. Core compares the client's tokens and never
interprets them. Shapes are domain-neutral. The web fill for each is in the paired document.

| Id | Kind | Domain-neutral shape | Read by Core in | Safe default when the client cannot supply it |
| --- | --- | --- | --- | --- |
| CC1 Typed fields | extend `AutomationStudioRecordField.valueType` and the detected-list field | `type?: text\|number\|currency\|count\|date\|datetime\|url\|id\|flag`, `parsed?` beside each sample | `contracts/.../condition-holds.ts`, sort, judge computed facts | Core infers from samples with `read-number.ts`/`read-date.ts`; no refusal, no warning |
| CC2 Per-item marks | new | per list `fieldMarks?: {id, label, kind: badge\|flag\|state}[]`, per item `marks?: {[id]: on\|off\|string}` | `where … is present` on a mark; discriminating-field note | Kept and left-out rows separated by text cells only, as now |
| CC3 Row identity | reuse `primaryKey` plus one field | `rowIdentity?: fieldId[]` on the detected list, stable per-row `itemKey?` | dedupe default, re-find, computed duplicates | Whole-row key (today) |
| CC4 Act effect record with inverse | extend `inspectStateDiff` output and `AutomationStudioSiteResetPlace` | `effect?: {class: observe\|state\|commit; places: {place, before, after}[]; placeChanged?: bool; inverse?: {action, control, toState} \| {kind: irreversible}}` | witness finding (P3), undo pairing (P4), lasting floor (P8) | Declared `consequences` stand; model-written `undoes` is the only pairing; no inverse means the act closes as unsettleable, never a refusal loop |
| CC5 Region/value witness | reuse `AutomationStudioSiteResetRead.values`, `differs` | `values: {[place]: token}` of any named region, with tokens hashed from stable content only | new `value` delta kind in `trial-change/delta.ts` | An unread side proves nothing (`unproven`); a witness needs two equal reads before use |
| CC6 Landing | new semantics, one field | `landing?: {from, to, marksDiffer: bool}` from `placeChanged` and the read's `location`/`resource` | witness kind `landing` | Never a landing (API clients); the trial runs as `unproven` (P2) |
| CC7 Obstruction | extend `AutomationStudioClearedLayer` and the failure record | `obstruction?: {id?, name?, kind: overlay\|notice\|rate_limit\|assistant\|other, covers?: targetRef, dismiss: {controlRef, definitionId?, intent: dismiss\|accept\|neutral, action?: back}[]}` on a covered or failed attempt and as a standing view fact | `clear_interference` rung, handler builder, handler condition | Explored-layer handlers only and no rung (today); old layer kinds accepted and mapped |
| CC8 Transient and rate limit | reuse failure `retryable`, `retryAfterMs`, `effect`; add a flag | `transient?: true`; `rate_limit` obstruction with optional `retryAfterMs` | pacing, retry-later, defensive assess | Cautious: not transient; transport codes stay; pace grows only with a hint (today) |
| CC9 Stateful controls | reuse `controls` on reads and `ensureState`; additive | per control at look time `stateful?: true; state?: string; idempotentWith?` | `toggle-idempotent.ts`, run-time ensure-state | Control treated as stateless; no `ensureState` written beyond explored toggles |
| CC10 Actionability | optional on actual dispatch/runtime/tool results | `actionability?: {actionable:true} \| {actionable:false; cause:hidden\|disabled\|covered}`; strict portable parser; wire only existing payload | target observation, never effect/permission/readiness proof | t827 native browser proof accepted; absence stays unknown |
| CC11 Control intent | new | `intent?: dismiss\|accept\|neutral\|navigate` per control at look time | `way-out-steps.ts` replacement | No accepting-word refusal for a client without intent; the web domain supplies its list, so web behaviour is unchanged |
| CC12 Action effect class | implemented t824 on canonical NodeDefinition.actionEffect and trusted resolveActionEffect; pure public subpath | observe/state/commit, explicit repeatSafe:true and known permission classes; parameter predicates resolve conservatively | native/output/graph/outside-graph retry floors and authoring permission union; child uncertainty terminal;0.17.1 typed skipped-act truth and unsettled-target route admission | absent contract retains legacy behavior; state alone never proves repeat safety |
| CC13 Medium vocabulary | reuse binding `systemInstructions` (`llm/harness-options/binding.ts:135`) and `nodeDescriptions` | node ids, medium words and examples for the script format | `flow-script-format.ts` assembly | Core's generic grammar with no node examples; the web binding supplies today's text |
| CC14 Act vocabulary | new optional binding member | `actVocabulary?: {kind, words[]}[]` | `instructed-acts/`, `step-skip/act-not-done.ts` | Generic kinds only (`save`, `set`, `move`, `open`, `submit`), advisory |

Core-internal contracts (no client input):

| Id | Shape | Where | Default |
| --- | --- | --- | --- |
| K1 Date bounds | `after`, `before`, `onOrAfter`, `onOrBefore` (ISO or relative word resolved against the run's `now`), `within: "<n> days"`; later `compareTo: <field>` | `processing-vocabulary.ts:26`, `parse-condition.ts`, `condition-holds.ts`, the parity cases, the web twin | Absent: today's vocabulary |
| K2 Row-count ask | `answer.rows?: {count\|atLeast\|atMost}`, derivable from the part's verbatim quote | `project-agents/supervisor/tools.ts:31-38`, `result-verification/contracts/requested-output.ts:7` | Absent: count not checked (today) |
| K3 Typed effect default | `effect` defaulted for a part with `lastingActs` (direction and count from the quote's numerals) | `supervisor/tools.ts:11-19`, `plan-input.ts` | Untypeable: judged from the run, as today; never refused |
| K4 Computed facts | `computedFacts` block with located defects in the `located-defects/` shape | `result-verification/build-test/summary.ts`, new `result-verification/computed-facts/` | Facts that cannot be computed are omitted and the judge asks as today |
| K5 Part-level dataset defaults | record output id, label, schema, `process.columns`, dedupe from the part's `answer` | `flow-bootstrap/authoring/record-output.ts` | The builder declares, as now |
| K6 Dead-requirement ledger | `(issue code, subject id)` across distinct drafts: redirect at 2, return `blocked` at 3 | `llm/evidence-progress/no-progress.ts` | No code or subject: today's page-based counter |
| K7 Latest-by-default trial | `revision`/`digest` optional; `test?: bool` on submit, default true after static acceptance | `subflow-trial-gate.ts:436-440`, `candidate/trial-gate.ts:374-376`, submit tool | A supplied stale pair is refused as now |

## Phased plan

Each phase ships on its own, defaults to today's behaviour when its client contract is absent, and is one `pnpm task`
unit started from the web extension checkout. "Core-paired" means a nested Core worktree, and Core merges under its own
gates. Tests live in the `tests/` folder beside their subject. Fixtures use a different kind of site from the ten
realistic scenarios (a library, a permit portal, a reservations desk). Provider-free validation is narrow, per the
twice-a-day rule:

- the package typecheck (`node scripts/build-cache/cli.mjs fluxiq:check`, plus `contracts:check` where contracts changed);
- `npx vitest run <changed dirs>/tests` from `packages/fluxiq` (or `packages/contracts`);
- the structure audit.

Live checks run in rounds after the round's phases merge and lane trees sync. A round runs one task per scenario named,
in a visible browser, started from the extension chat, judged as change from the recorded before-state, and the UI is
reviewed each time.

### P0. Remove scenario-shaped model text (done, t793)

Shipped 2026-10-29; see the Work Ledger. The phase text is in
[archive/2026-10-29-audit-briefs-and-p0.md](framework-heavy-lifting-plan/archive/2026-10-29-audit-briefs-and-p0.md).

### P1. Fold build-loop bookkeeping (Lane A)

- Files:
  - `llm/evidence-loop.ts:748`: an unknown tool goes through `llm/evidence-loop/decision-refusal.ts` with the offered
    ids and the nearest match, and counts toward the refused-in-a-row guard.
  - `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts` and `flow-bootstrap/candidate/trial-gate.ts` (K7).
  - The submit tool (`subflow-candidate/submit-tool.ts`, `builder-loop.ts`): test on submit, and auto-complete on a yes
    for the latest revision. The build-yes hold and lone-yes confirmation stay between the judge and the completion.
  - `project-agents/supervisor/dispatch-tool.ts`, `brief-input.ts`: `parts`, `kind` and `failingReceipt` defaulted;
    `project.repair_unchanged` checked before the decide.
  - `project-agents/single-subflow/`: a derived dispatch.
  - `project-agents/dispatch/ending.ts`: one automatic re-brief for Core-caused stop codes.
  - `flow-bootstrap/candidate/unchanged-submission.ts`: the diff and the fix point on the first `unchanged_after_no`.
  - `activity/decision-reason.ts`: a Core-written line for folded steps.
  - `service/project-build-ending/ending-told.ts`: the done reason from the record.
- Contract: K7. No client input.
- Tests:
  - `llm/tests/evidence-loop-unknown-tool.test.ts`
  - `flow-bootstrap/subflow-candidate/tests/subflow-trial-gate-latest.test.ts`
  - `flow-bootstrap/subflow-candidate/tests/submit-tests-on-accept.test.ts`
  - `flow-bootstrap/subflow-candidate/tests/builder-loop-auto-complete.test.ts` (a held yes does not complete)
  - `project-agents/supervisor/tests/dispatch-defaults.test.ts`
  - `project-agents/dispatch/tests/ending-rebrief-once.test.ts`
  - `flow-bootstrap/candidate/tests/unchanged-submission-fix-point.test.ts`
- Provider-free validation: those dirs' tests, plus a scripted fake-provider decision sequence asserting:
  - an unknown id is refused, then the corrected call runs;
  - a clean submit returns its verdict;
  - a yes completes without a decide;
  - a stale pair is still refused.
- Live: the everything-store checkout task. Expect no test-after-submit or complete decides, no build ended on
  `unknown_tool`, and every step still in the chat with a reason. Compare decides with the 104 baseline.
- Expected effect: F6 (20 decides, $0.0131, 41 s at baseline; $0.0078 and 25 s on top of P2 and P3).
- Unit: `pnpm task start fhl-build-bookkeeping` (Core-paired).

### P2. An honest trial door and a dead-requirement stop (Lane B)

- Precondition: read the completion path and confirm that a part whose proof is `unproven` cannot complete on a judge
  yes unless that yes quotes the run's own reads. If it can, add that hold in this phase.
- Files:
  - `flow-bootstrap/site-reset/project-reset.ts:136-141`: refuse only when a witness is reachable (an issuable reference
    of the step's resource exists, or a control receipt can be read here); otherwise admit, and name the step in
    `startedWith.cannotUndo` as "no witness, left as is".
  - `site-reset/words.ts:171-176` and `site-reset/create-baselines.ts:123`: list only references of the same resource.
  - `reset-admission/admission.ts:64-88`: `canMeet` computed from reachability, never a constant.
  - `trial-change/proof.ts`: unchanged; `unproven` is never a grounded no and never a yes by itself.
  - `llm/evidence-progress/no-progress.ts` (K6).
  - The trial gate keeps a pending trial request and reruns it once the refused condition is met, within the 3 trials
    per revision.
- Contract: none new (`resource` and `location` already ride on reads).
- Tests:
  - `flow-bootstrap/site-reset/tests/project-reset-unproven.test.ts`
  - `site-reset/tests/create-baselines-reachable-refs.test.ts`
  - `reset-admission/tests/admission-can-meet.test.ts`
  - `llm/evidence-progress/tests/no-progress-dead-requirement.test.ts` (one code on one subject across 3 drafts
    returns `blocked`; a slow but changing requirement does not)
- Provider-free validation: those dirs plus `trial-change/tests`. Replay the refusal sequences of the measured build
  and of mvswhobv as structural fixtures with generic names, and set N by counting repeats in the 8 debug-note traces.
- Live: crossborder-marketplace (the cart task, expecting trials to run and be judged) and the everything-store checkout
  task (expecting no chain of `trial_step_unwitnessed` and no fictional witness).
- Expected effect: F3 (35-46 decides, ~$0.03, 70-90 s model time, 140-160 s wall clock on the measured build).
- Unit: `pnpm task start fhl-honest-trial-door` (Core-paired; no web change).

### P3. Region, value and landing witnesses (Lane B, after P2)

- Files:
  - `reset-admission/witness.ts:24-29` and `reset-admission/stamp-valid.ts:49-55`: `via: region` and `via: landing`.
  - `trial-change/delta.ts`: a `value` delta kind compared by token equality.
  - `trial-change/proof.ts`: a landing proves only when `marksDiffer`.
  - `trial-change/contradicted.ts`: direction for value deltas.
  - `site-reset/contracts.ts:168-196`: typed optional slices for CC4 and CC6.
  - `site-reset/ledger.ts`: after a lasting exploration press, Core looks at up to 3-5 locations its read-log holds for
    the same resource. The call result says "witnessed at <ref>" or "effect not seen".
  - The witness requirement now follows the observed effect. A navigation-only press needs only a landing.
    `consequences` are never lowered (F3, row 10 of the map).
- Contract: CC4 (places, `placeChanged`), CC5, CC6. Paired W3.
- Default: with no slices, P2's `unproven` admission.
- Tests:
  - `reset-admission/tests/witness-region.test.ts`
  - `trial-change/tests/delta-value.test.ts` (a token that changes between two reads with no act is not a witness)
  - `trial-change/tests/proof-landing.test.ts` (same marks after a landing is not witnessed)
  - `site-reset/tests/ledger-found-destination.test.ts`
- Provider-free validation: those dirs, plus a scripted fake client that emits `values` and `landing`.
- Live: crossborder-marketplace cart (a region witness proves the change) and the everything-store checkout task (a
  landing witness for the navigating press, so the cart need not be named).
- Unit: `pnpm task start fhl-region-landing-witness` (Core-paired with W3).

### P4. One truthful undo and reset answer (Lane B, after P3)

- Files:
  - `reset-settlement/own-control.ts` and `reset-admission/undo-admission.ts` (`:141`, `:184`, `:197`): one shared
    "back at its place" function, keyed by one place per act.
  - `reset-settlement/decision.ts`: a list read in place after an undo is not judged until a fresh read.
  - `site-reset/undo-reach.ts:96-103`: one answer never says both "this page can" and "no call can".
  - `site-reset/ledger.ts:157-169,617-621`: every act in `actsToUndo` has an admissible call or moves to
    `actsUnsettleable`, which gives a closed `gate_unsatisfiable` ending that names the leftovers.
  - `site-reset/undo-claims.ts`, `undoes-tool.ts`: `undoes` becomes an optional hint, and Core pairs by inverse effect
    (same witness, opposite delta). The attach list applies only on the act's own page.
  - The trial gate's `cannotUndo` is defaulted.
  - `site-reset/words.ts`: `outsideBrief` points to a plan amendment; a call under `undoes` is never outside the brief;
    `retryRefused` is reworded so it no longer invites the same stale handle.
- Contract: CC4 `inverse`. Paired W4 (one place token per act).
- Default: no inverse means the model's `undoes` as today, plus the closed ending instead of a refusal loop.
- Tests:
  - `reset-settlement/tests/own-control-shared-answer.test.ts`
  - `reset-settlement/tests/decision-stale-in-place.test.ts`
  - `site-reset/tests/ledger-act-to-call.test.ts`
  - `site-reset/tests/undo-claims-inverse.test.ts`
  - `site-reset/tests/undo-reach-one-answer.test.ts`
- Provider-free validation: those dirs, with fixtures for a looped act over two items whose pages differ (the
  mvrj-a44a shape on a library site) and a reloading `modify_existing` press.
- Live: job-board (the save task, mvrj-b6dc), then photo-social (newest likes, mvrj-a44a) and everything-store (office
  checkout, mvrj-6916) in later rounds.
- Expected effect: F2.
- Unit: `pnpm task start fhl-undo-settlement` (Core-paired with W4).

### P5. Computed-first judging (Lane C; may ship as 5a computed facts with Core no, then 5b narrowed prompt and cited yes)

- Files:
  - New `result-verification/computed-facts/` (K4), which checks:
    - count against `answer.rows`;
    - required columns present and filled;
    - `repeated` rows;
    - each cell is verbatim text of one end-view element, under a declared normalisation;
    - every `where` bound holds on every kept row (extending `value-readings/settled-rows.ts`);
    - sort order from `sortReading`;
    - every repeat pass passed;
    - typed effect proofs;
    - `unchanged:` places are equal before and after, on witnesses stable across two reads.
  - `result-verification/build-test/summary.ts`.
  - `verify.ts`: a computed fail is a Core no without a judge call. A no is re-asked only when its defect is ungrounded,
    and the re-ask varies its wording (converse or row order), never a byte-identical copy.
  - `agreement/*`: the override is symmetric (computed fail beside a judge yes gives no).
  - The yes schema in `llm/deepseek/output-schema.ts` cites a supporting cell per row, and Core checks the citation.
  - `agreement/exclusion-words.ts`, `unstated-exclusion.ts`: a settled condition is accounted for only by its own
    sentence and quote, with no column alias.
  - `refuted-no/`: items seen are not the stored count.
  - `earlier-advice.ts`: only located defects are carried.
  - Left-out rows reach the judge with their answer cells.
  - `service/candidate-trial/feedback.ts`: provenance is marked `judge_said` or `core_found`.
  - `llm/diagnosis-instructions.ts` shrinks to the semantic residue.
  - `project-agents/supervisor/tools.ts` (K2, K3).
- Contract: K2, K3 and K4. CC1 improves normalisation. Paired W5 supplies each stored cell's source reference.
- Default: an untyped part is judged as today. A fully computed pass is still not a yes.
- Tests:
  - `result-verification/computed-facts/tests/` (count, columns, repeated, verbatim, kept bounds, unchanged-stable)
  - `result-verification/agreement/tests/symmetric-override.test.ts`
  - `agreement/tests/exclusion-own-sentence.test.ts`
  - `result-verification/tests/earlier-advice-located-only.test.ts`
  - `project-agents/supervisor/tests/answer-rows.test.ts`
- Provider-free validation: those dirs, with recorded judge packets as structural fixtures (renamed to a library
  domain). Assert that:
  - the three value-shape defects of the measured build become Core nos;
  - an oracle-correct result with only ungrounded nos ends unsure, never no;
  - the false-pass shape is held.
- Live: social-network-feed (recent group posts; 3 runs lost to false nos) and everything-store (the deal-wheel read; a
  false pass). Expect Core agreement with the oracle, and no unsure from a double ungrounded no.
- Expected effect: F1.
- Unit: `pnpm task start fhl-computed-judging` (Core-paired with W5).

### P6. Interruptions, toggles and pace (Lane D)

- Files:
  - `executor/ladder-run.ts:11,153` and `recovery-ladder.ts:164`: the `clear_interference` rung runs a non-committing
    dismiss from CC7 with no Flow node, re-waits for the target and attempts again.
  - `service/runtime-session/interruption-handler.ts:40,46` and `executor/step-loop/incident-repair.ts`:
    - the condition becomes an `obstruction` fact, with `dialog` kept as an alias;
    - the handler is keyed by layer identity;
    - it covers the part after two observations;
    - there is no handler for a layer whose control the Flow itself presses.
  - `flow-bootstrap/layer-handlers/explored.ts`, `patch.ts`: also built from trial interruptions
    (`service/candidate-trial/interruptions.ts`, `way-outs.ts`).
  - `script-statements/toggle-idempotent.ts`: `ensureState` from trial presses; a plain press on a CC9-stateful control
    is rewritten to its idempotent counterpart.
  - `trial-change/pass-witnesses.ts`: one witness per pass. This file is Lane B's, so it ships in Lane B's tree or after P4.
  - `executor/pacing/pace-keeper.ts`: learns from `rate_limit` without a hint (×1.5 from a 1 s floor, capped at 60 s).
  - `candidate/trial-slow-down.ts`: Core writes the pace step.
  - `executor/node-execution/cleared-layer.ts:13`: accepts the generic kinds and maps the old ones.
- Contract: CC7, CC8, CC9. Paired W6.
- Default: explored-layer handlers only, no rung, pace only from hints.
- Tests:
  - `executor/tests/ladder-run-clear-interference.test.ts`
  - `service/runtime-session/tests/interruption-handler-layer-scope.test.ts`
  - `flow-bootstrap/layer-handlers/tests/trial-interruptions.test.ts`
  - `script-statements/tests/toggle-idempotent-trial-pass.test.ts`
  - `trial-change/tests/pass-witnesses-per-pass.test.ts`
  - `executor/pacing/tests/pace-keeper-no-hint.test.ts`
- Provider-free validation: those dirs, plus a scripted fake client reporting an obstruction with a dismiss control.
- Live: photo-social (newest likes). Expect the dock handled in playback, the likes to stay set, a witness on each
  pass, and the UI reviewed.
- Expected effect: F4, F5.
- Unit: `pnpm task start fhl-layers-toggles-pace` (Core-paired with W6).

### P7. Grammar and dataset defaults (Lane E)

- Files:
  - `packages/contracts/src/record-sets/process/processing-vocabulary.ts`, `parse-condition.ts`, `condition-holds.ts`
    and the parity cases (K1, using `read-date.ts:60` with the run's `now`).
  - `flow-bootstrap/plan/flow-script-format.ts` (`AUTOMATION_STUDIO_FLOW_CONDITION_RULES` `:345-350`): one line each,
    with examples from a different kind of site.
  - `service/candidate-trial/reads.ts`: a count of unreadable dates.
  - `where … is present` on a CC2 mark.
  - `script-statements/listed-values-advice.ts`: the advisory note names a field that separates kept from left-out rows
    on every sample, in generic words. It becomes a one-time `accepted_once` refusal only after marks ship.
  - A new `script-statements/numeric-text-test.ts`: refused once.
  - `script-statements/record-replace-in-repeat.ts` pattern: move `process.where` onto a lasting repeat's listing.
  - `authoring/record-output.ts` (K5, CC3).
  - Paging added or required only from a reported `continues` and next control.
- Contract: CC1, CC2, CC3; K1, K5. Paired W7 keeps the web twin semantics identical.
- Default: no types means the readers; no marks means text cells; no `rowIdentity` means the whole row.
- Tests:
  - `packages/contracts/src/record-sets/process/tests/condition-holds-date.test.ts`, `parse-condition-date.test.ts`
  - `script-statements/tests/listed-values-discriminating.test.ts`
  - `script-statements/tests/numeric-text-test.test.ts`
  - `authoring/tests/record-output-part-defaults.test.ts`
- Provider-free validation: the contracts and fluxiq typechecks, plus those dirs.
- Live: social-network-feed (recent group posts). Read the Flow as well as the oracle: no literal group list, and a
  date bound in place of a regex.
- Expected effect: F7.
- Unit: `pnpm task start fhl-grammar-dates-marks` (Core-paired with W7).

### P8. Run-time robustness (Lane D, after P6)

- Files:
  - `executor/defensive/lasting-act.ts:54` and the permission gate class: the union with CC12 `commit`.
  - `executor/target-reacquire/before-attempt.ts`, `lineage.ts`: identity re-find at attempt 2 for any target; the
    source-step path stays for row-bound targets.
  - CC8 accepted t826: `llm/repeat-guard/retry-later.ts` uses strict typed unacted temporary facts; host produces
    them after wire parsing. Generic `executor/defensive/thrown-error.ts` transport/status fallback stays in Core.
  - `executor/step-skip/act-not-done.ts:26`: the effect class replaces English words.
  - A step-loop run-time repeat guard on (node, target, inputs, view digest) that ends after 2 identical unchanged repeats.
  - `recovery/in-run-repair/history.ts`: adds obstructions, paces, re-acquire and state-route records.
- Contract: CC8, CC10, CC12, and `reacquireTarget` accepting an identity with no source step. Paired W8.
- Tests:
  - `executor/defensive/tests/lasting-act-client-floor.test.ts`
  - `executor/target-reacquire/tests/before-attempt-identity.test.ts`
  - `llm/repeat-guard/tests/outcomes.test.ts` (plus real loop/amendment/privacy owning tests in t826 reports)
  - `executor/step-skip/tests/act-not-done-effect.test.ts`
  - `executor/step-loop/tests/run-repeat-guard.test.ts`
  - `recovery/in-run-repair/tests/history-record.test.ts`
- Live: job-board (the save task: a lasting repeat with re-rendering rows).
- Expected effect: F9, unmeasured.
- Unit: `pnpm task start fhl-runtime-robustness` (Core-paired with W8).

### P9. Append-only evidence and batched re-runs (Lane A, after P1)

- Files:
  - `llm/context-window.ts`, `llm/decision-context/view-groups.ts`: each result enters with its view already a
    reference, and one fixed trailing block holds the current view whole and the current read rows. This keeps B1's
    rule that a left view is not resent, and the model still sees the whole current page.
  - `route_state` sent as changed keys only.
  - The `core.submit_subflow` schema variant only where the tool is callable.
  - A new `llm/node-tools/run-nodes.ts` (`core.run_nodes`): identical-parameter, non-lasting re-runs; it stops on the
    first failure or on a changed result code; the repeat guard is keyed on the list.
- Contract: none.
- Tests:
  - `llm/evidence-loop/tests/request-prefix.test.ts` extended (byte prefix across a view replacement)
  - `llm/tests/context-window-append-only.test.ts`
  - `llm/node-tools/tests/run-nodes.test.ts`
- Live: the everything-store checkout task. Measure excess miss tokens (target: under half of 161k) and decides.
- Expected effect: F8 (about $0.012 and 37 s at baseline; $0.006 and 15 s after P2).
- Unit: `pnpm task start fhl-append-only-evidence`.

### P10. Client concepts out of Core (Lane E, after P7; may split into format, word lists, fingerprint)

- Files:
  - `flow-bootstrap/plan/flow-script-format.ts`: the generic grammar. Node ids, medium words and examples come from CC13.
  - The other `web.` literals in `plan/issue-feedback.ts`, `service/candidate-trial/feedback.ts`,
    `llm/repeat-guard/outcomes.ts`, `llm/harness/locator-text.ts`, `candidate/submission-refusal.ts`.
  - `script-statements/way-out-steps.ts:71-75` (CC11).
  - `instructed-acts/kind-words.ts`, `instruction-acts.ts:78`, `act-object.ts:50` (CC14).
  - `answerability/instruction-ask.ts`: reads the typed `answer.kind` first.
  - `script-statements/fact-condition.ts:95`, `plan/contracts.ts:125`, `llm/harness-options/plan-fact-targets.ts:17`:
    `obstruction`, with the `dialog` alias.
  - `model/action-element-target.ts` and `fingerprinting/element-fingerprint.ts`: an open signals map with
    client-named signals and weights.
  - `state-routing/announcement.ts`: "view" in place of "page".
  - A structure-audit rule in Core (mirrored downstream): no `web.` literal in Core source outside tests.
- Contract: CC11, CC13, CC14. Paired W10.
- Default: the web binding supplies today's text and lists, so web prompts are unchanged.
- Tests:
  - `flow-bootstrap/plan/tests/flow-script-format-generic.test.ts`
  - `script-statements/tests/way-out-steps-intent.test.ts`
  - `instructed-acts/tests/kind-words-vocabulary.test.ts`
  - the structure-audit rule test
- Provider-free validation: assemble the web binding's system prompt before and after, and compare. The difference must
  be ordering only.
- Live: one breadth task on any one realistic scenario.
- Unit: `pnpm task start fhl-client-concepts-out` (Core-paired with W10).

## What not to do

- **Do not teach to the test.** No guidance, tool description, catalog text, feedback text or example names a
  realistic scenario's task, site, products, names or answer. Hints Core computes (a discriminating field, a separating
  mark) are worded from the data in generic terms and never quote a site's control words. Fixtures with scenario names
  stay in tests.
- **Do not hide failures.** A Core-written chat line, a folded turn, an auto-completion or a batched re-run must still
  show each step and its reason. `unproven` and unsettleable acts are named in the ending, never dropped. Lab reporting
  must read structured data, not prose (W0).
- **Do not weaken oracles or force passes.** Computed checks only add located defects. Only a yes passes. A fully
  computed part does not pass without a model yes until the user decides otherwise (open question 1). Never accept a
  fiction witness, and never relax the quote guard to let a yes through.
- **Do not reduce generality.** Flows stay general structure: no literal lists in place of signs, and no fixture-shaped
  defaults. Grammar additions are vocabulary, not shortcuts for one site.
- **Do not grow client concepts in Core.** New contract fields are domain-neutral. No new `web.` literal, DOM word,
  English word list or layer kind in Core. Each phase keeps the move-out direction of P10.
- **Do not add resets.** Witnesses and settlement judge the change from the recorded before-state. A reset undoes only
  this build's own acts, and only where the before-state cannot make a trial meaningful.
- **Do not add fail-closed gates the model cannot satisfy.** Every new check either computes, defaults, or refuses
  only what a call can meet, with a truthful `canMeet` and a closed honest exit. An absent client field degrades to
  today's behaviour.
- **Do not lower declared consequences or restrict actions beyond permissions.** Floors only raise. The model may do
  anything a person could, gated only by the permission classes.
- **Do not rely on judge frequency.** Quorums and lone-yes rules are not checks on their own while byte-identical
  prompts flip. Grounding comes first, and variance reduction (varied re-asks) is a last resort, only on disagreement.
- **Do not add parallel paths.** Extend `toggle-idempotent.ts`, `layer-handlers/`, `target-reacquire/`,
  `trial-change/` and `located-defects/`. Where the computed layer covers a case, replace `refuted-no/` sentence
  weighing instead of sitting beside it.
- **Do not run full suites per phase** or start live runs with an agreed fix still in flight.

## Worker Briefs

The wave-2 audit briefs (fhl-core-*) ran 2026-10-28 and are archived in
[archive/2026-10-29-audit-briefs-and-p0.md](framework-heavy-lifting-plan/archive/2026-10-29-audit-briefs-and-p0.md).
Each implementation lane's brief is in its dispatch and its report under the downstream `framework-heavy-lifting-plan/reports/`.

## Work Ledger

The P0, t794, t796, P4 (t797), P5a (t795) and P7 (t800) entries moved on 2026-10-29 to
[archive/2026-10-29-audit-briefs-and-p0.md](framework-heavy-lifting-plan/archive/2026-10-29-audit-briefs-and-p0.md).

Accepted P1a, P7 follow-ups, repair-from-step, P6, Claude-provider and P5b ledger entries moved verbatim to
[archive/2026-10-30-accepted-continuation.md](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Settled earlier history compaction is preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

Accepted t811 and t817 evidence is preserved verbatim in [the continuation archive](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Accepted t819/t820 evidence is preserved verbatim in [the continuation archive](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Settled continuation compaction is preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

The settled sweep2 result is preserved verbatim in [the continuation archive](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Accepted t822 evidence is preserved verbatim in [the continuation archive](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Accepted t823 assignment and lead acceptance are preserved verbatim in [the continuation archive](framework-heavy-lifting-plan/archive/2026-10-30-accepted-continuation.md).

Settled accepted client effect floor is preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

Accepted t825 evidence and its compaction record are preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

Accepted t826 ledger preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).
Accepted t827 ledger preserved verbatim in [the accepted archive](framework-heavy-lifting-plan/archive/2026-10-31-accepted-client-effect.md).

### 2026-10-31 - t828 source-less target discovery
- Agent: Codex lead; two bounded read-only discovery workers.
- Changed: paired task setup, discovery briefs; accepted t827 ledger archived verbatim.
- Why: source-less literal targets currently lack the source-step retry path.
- Validation: `pnpm.cmd task start runtime-target-identity --worktree --core --skip-workspace-build` ->exit0, both private trees created and all three mandatory SDK libraries built (Core73.93s); no new runtime tests.
- Outcome: Partial; Core122, domain affected91/final18/native16, extension84 and trace-reader4 tests pass; affected types/builds/audits pass. Installed browser rerun pending.
- Follow-up: reconcile Core and web findings, freeze an additive interface, then implement and run owning checks; no full suite/paid calls.

## Open Questions

1. **May a fully typed, fully computed part pass without a model yes?** Resolved in part by the user on 2026-10-30:
   a fully refuted judge rejection may pass only after a judge re-prompt with Core's evidence; an unrefuted new defect
   still blocks. Passing computed results without first asking a judge remains outside this approval. Owner: the user.
2. **What does a lone yes mean beside nos that were refused or ungrounded?** Owner: Lane C lead. mvrj-c20c raised it as
   a policy question, and mvswewhy Fix 1 proposes a reachable confirming ask. Recommendation: keep it `unsure` until
   P5's grounding lands, then re-measure. With temperature-0 flips, a third ask is a coin toss unless the defect is grounded.
3. **Can a yes complete a part whose proof is `unproven`?** Owner: Lane B, first task of P2. Not verified. If it can, P2
   adds a hold so that such a yes must quote the run's own reads.
4. **What N stops a dead requirement (K6)?** Owner: Lane B (P2). Proposed 3. Set it by replaying the 8 debug-note traces
   and the measured build. The existing guard's history (3 too tight, 24 never fired, 8 read off a trace) argues for replay.
5. **Discriminating-field note or one-time refusal for literal lists?** Owner: Lane E (P7). It depends on whether Core
   holds per-item values for every detected field (not verified). Ship the note first, and promote it only after marks (CC2) ship.
6. **How do rows a lasting repeat walks get ordered and excluded (pinned items taken as newest)?** Owner: Lane E.
   Guidance would mirror the scenario (high teaching risk). The option left is for Core to compute "this field marks
   the first rows out of sort order" from the read's marker field, or do nothing. Decide after P7.
7. **When does `unasked_change` become a hard no?** Owner: Lane C (P5). Proposed: only for places the task marks
   `unchanged:`, and only on witnesses stable across two reads. Settle against rotating content in fixtures first.
8. **Should Core probe provider determinism (seed or knobs)?** Owner: the lead. It costs a few paid calls. No seed is
   documented, so do not rely on one, and run a probe only with a live agent supervising it.
9. **How much of `refuted-no/` (25 files of sentence weighing) does the computed layer replace?** Owner: Lane C, at
   P5 design. Recommendation: replace each part the computed facts cover, in the same unit.
