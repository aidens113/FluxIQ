# Audit briefs and P0, archived 2026-10-29

Moved from `../../framework-heavy-lifting-plan.md` at its first compaction. The wave-2 audit ran 2026-10-28 and fed the
synthesis; P0 shipped in t793. Outcomes are in that document's Work Ledger.

## P0 phase text

### P0. Remove scenario-shaped model text (lead or Lane C, direct, before the lanes start)

- Files:
  - `llm/diagnosis-instructions.ts` (I171, I256 sentences listed in F0);
  - `llm/node-tools/run-node.ts:90`;
  - `flow-bootstrap/plan/evidence-schema.ts:115`;
  - `flow-bootstrap/plan/flow-script-format.ts:466,473` ("Garden Club");
  - the judge's membership example (to a non-membership relation, such as documents checked out from an archive).
- Contract: none.
- Tests: the existing text tests beside each file, plus a grep assertion in `llm/tests/` that the model-facing strings
  contain none of the realistic scenario names or their product words.
- Validation: the typecheck and `npx vitest run src/programs/automation-studio/runtime/llm/tests
  src/programs/automation-studio/runtime/flow-bootstrap/plan/tests`.
- Live: none on its own. It rides in the first round.
- Unit: `pnpm task start fhl-scenario-text` (Core-paired).

## Worker Briefs (wave-2 audit)

Shared for every wave-2 brief: read only; no source edits, git, builds, model calls or Lab runs. Root: packages/fluxiq/src/programs/automation-studio/. Context: the downstream fhl-core-surface and fhl-debug-notes reports. For every responsibility the model holds in the area, classify (a) needs a model, (b) Core could compute, enforce or default for any client (web, desktop, mobile, API), naming the generic contract the client supplies, or (c) client-specific. Cite file:line and debug-note step numbers. Report to docs/working/framework-heavy-lifting-plan/reports/<label>.md, under 250 lines.

### Brief: fhl-core-build-tools
- Area: the build/explore loop the model drives: runtime/llm (model-facing, node-tools, decision-handlers, decision-context, domain-instructions, stages, evidence-loop, harness), runtime/project-agents dispatch and single-subflow.

### Brief: fhl-core-grammar
- Area: plan and script grammar and submission checks: dsl/, runtime/flow-bootstrap (plan, script-statements, authoring, parameter-schema, parameter-words, answerability, reachability, instructed-acts, layer-handlers, subflow-candidate, verification, incomplete-draft, unfinished-build).

### Brief: fhl-core-trials-resets
- Area: trials, offline trials, witnesses, site-change readings and resets: flow-bootstrap (trial-change, offline-first, reset-*, site-reset, candidate), service (candidate-trial, offline-trial, subflow-trial, trial-ports, candidate-failure), llm/candidate-receipt. Evidence includes run-mvswhobv-5eb308c0.

### Brief: fhl-core-judging
- Area: judging and result verification, repair of refuted results: runtime/result-verification, llm/verification-defects, recovery/refuted-result; judge nondeterminism.

### Brief: fhl-core-runtime
- Area: runtime execution, retries, handlers and interruptions, target re-acquire, routing: runtime/executor, recovery (in-run-repair, exploration-state), route-state, parking, loop-limits, action-permissions, composite-execution, llm/repeat-guard.

### Brief: fhl-core-data-supervisor
- Area: datasets and post-processing, project supervisor and briefs, purse, chat/activity: service (datasets, scalar-readings, project-build*), runtime/project-agents (supervisor, amendment, record, stop-reason), llm (build-purse, purse, evidence-progress), runtime/activity, runtime/conversations.

### Brief: fhl-core-client-seam
- Area: the Core-to-client contract: client-gateway/, runtime/adapters.ts, contracts.ts, environment, io-bridge, panel-capabilities, fingerprinting/, plus how the downstream web domain implements it; where Core holds client concepts it should not.


## Ledger entries moved 2026-10-29 (P0, t794, t796)

### 2026-10-29 - P0 and the check's library build (t793, t794)
- Agent: lead; detail and validation in the paired downstream document's ledger.
- Changed: P0 replaced the scenario-shaped examples in the model-facing judge, run-node, evidence, processed-out and repair text, and the downstream `scripts/check/model-text.mjs` now fails on any realistic scenario's fixture word in Core's model-facing literals. t794 made the root `check` build `contracts`, `fluxiq` and `client-gateway-websocket` first, with a registry test.
- Validation: lead-run, quoted in full downstream: `node scripts/check/model-text.mjs` -> "model-text: ok (209 scenario tokens, 376 model-facing Core files, 11720 string literals)"; `node --test scripts/build-cache/tests/registry.test.mjs` -> "# pass 10 / # fail 0"; `pnpm check` -> exit 0.
- Outcome: Accepted.

### 2026-10-29 - Per-pass act ledger and `not_run` proof (t796)
- Agent: supervisor (brief t796-ledger) with six workers; report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t796-ledger.md`
- Changed: `flow-bootstrap/instructed-acts/optional-act-steps.ts` refuses a requested act behind `optional:`, `only after:` or an optional step's `on success:`, matched by words or by the part's `lastingActs` class (`candidate/submission.ts`, `subflow-candidate/scoped-submission.ts`); `service/candidate-trial/act-ledger.ts` and `not-run.ts` record each pass's lasting and guarded steps, and `trial-change/proof.ts` proves a part `not_run` (with `notRun: [{nodeId, label, reason, after?, passes, of?}]`) when none of its acting steps ran, wired on the candidate and subflow trial paths; `layer-handlers/explored.ts` and `runtime-session/interruption-handler.ts` scope a cleared layer's handler to the subflow; `script-statements/repeat-order.ts` and `nodes/control-flow/for-each.ts` (`order`) sort a page-order listing's rows before `stopAfter`, and `listing-order-in-repeat.ts` admits a sort written on the listing; `project-build-ending/record-told.ts` names steps that never ran and each leftover's page.
- Validation: lead-run under the heavy-check lock -> touched dirs "Tests 7622 passed | 2 skipped", real-sql passed, prompt contracts "45 passed", `pnpm check` exit 0, docs current, structure passed; downstream headed site-reset suite "32 passed (35.0m)" (detail downstream).
- Outcome: Accepted. Hand-off: t795 makes `not_run` a Core no in `result-verification/site-change/held.ts` and defines it in the judge text.


## Ledger entries moved 2026-10-29 (P4 t797, P5a t795, P7 t800)

### 2026-10-29 - P4: one truthful undo and reset answer (t797)
- Agent: supervisor (brief t797-p4); workers split, settle, pair (worker-heavy), w4, defaults, docs (worker); report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t797-p4.md`
- Finding: three photo-social builds ended Blocked with no Flow (mvrj-6916, mvrj-b6dc, mvrj-a44a) because admission and settlement answered "is this act undone" from different place tokens, so one said "press back" while the other said `undo_already_back`.
- Changed: back-at-place, undo reach and settlement now read one shared answer (`reset-undo/reach.ts`, `reset-settlement/own-control.ts`, `decision.ts`); stale in-place reads are not judged; an act Core closed as unsettleable ends with a closed reason and is the default of `cannotUndo`; an undo pairs with its act by the inverse effect a client reports (CC4, optional `effect` carried through `site-reset/start-check.ts` and `llm/harness-options/binding.ts`), falling back to control counts; `site-reset/ledger.ts` was split into sibling `reset-undo/` and `reset-ledger/` keeping every exported name; `trial-defaults/before-trial.ts`.
- Decision (supervisor): `cannotUndo` defaults only to acts Core closed as unsettleable, not every listed act, which would tell the judge that undoable acts cannot be undone (5 project-build tests caught it).
- Validation: lead-run under the heavy-check lock on the trees merged with dev (t796 in): `pnpm test` over flow-bootstrap, service, llm/harness-options, project-agents, result-verification and executor -> "Test Files 824 passed | 1 skipped (825)", "Tests 7605 passed | 2 skipped (7607)", real-sql "52 passed", "all groups passed"; prompt contracts "Tests 45 passed (45)"; `pnpm check` exit 0; docs current; `structure:check` passed; downstream domain tests "# pass 2444 / # fail 0", headed `e2e/site-reset/tests` "32 passed (40.6m)".
- Outcome: Accepted. Open: the web domain does not fill the CC4 `effect` yet, so pairing uses control counts live; a press paired as an undo keeps its own `act-N` entry in the project ledger.

### 2026-10-29 - P5a: Core settles what it can compute before any judge (t795)
- Agent: supervisor (brief t795-p5); workers w1, w1b, w2, w3, w6 (worker-heavy), w4, w5, w7 (worker); report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t795-p5.md`
- Changed: new `result-verification/computed-facts/` (columns the build declared, kept bounds, rows left out and accounted for, repeated rows, every repeat pass ran, order, verbatim) and `computed-no.ts`; a failing fact is a Core no with no judge call (`core.result.computed_fact_failed`), facts that hold reach the judge as `computedFacts`, and a pass still needs a model yes; `asked-words/` (search words under "every search result", request exclusions); `site-change/held.ts` and `act-passes.ts` give a Core no over t796's `not_run`, defined in `llm/diagnosis-instructions.ts`; K2 `answer.rows` in the task checklists.
- Decisions (supervisor): only a column the build declared can fail (one read off the instruction's English stays information for the judge); a group of rows left out together is accounted for by one settled member condition quoted in its own sentence, which kept the correct social yeses while the stricter every-member rule held them.
- Validation: lead-run under the heavy-check lock: on the tree merged with dev (t796) `pnpm test` over result-verification, llm, project-agents, recovery, service and flow-bootstrap -> "Test Files 978 passed | 1 skipped (979)", "Tests 9079 passed | 2 skipped (9081)", real-sql "53 passed", "all groups passed"; prompt contracts "Tests 45 passed (45)"; `pnpm check` exit 0; zero-call replays of the recorded judge replies (`scratchpad/t795-w6/replay.mts`, final rule): store runs mvswh11y and mvtdoyf3 -> every false-pass revision and playback 0137 `does_not_answer` / `core.result.computed_fact_failed` with 0 calls, rev 1 no longer refused (`unsure`); social runs mvskodlp and mvswewhy -> 0042 `answers` / `core.result.answers_request`, as before; after merging t797, the overlap dirs -> "Test Files 332 passed (332)", "Tests 2923 passed (2923)", real-sql "8 passed", `pnpm check` exit 0, structure passed; headed site-reset suite "32 passed (35.3m)" (downstream).
- Outcome: Accepted (P5a). Not done: P5b (cited yes, re-asks with varied wording, located-only earlier advice, feedback provenance); a verbatim-cell fact (no stored cell carries its source text); date-order claims (dates are stored only when in the schema; sent to t800 under K5, with bare "1d"/"1w" in `read-date.ts`); a Core no keeps no `standingNo` record; after a Core no the extension's toast reads "the fix didn't finish" (fixed in t805).

### 2026-10-29 - P7: relative dates, marks, record defaults (t800)
- Agent: supervisor (brief t800-p7); workers H1 dates, H2 marks (worker-heavy) and ten worker; report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t800-p7.md`. t790 had already shipped absolute date bounds, the undated count, the row-mark suggestion and `continues`; only the gap was built.
- Changed: `packages/contracts/src/record-sets/process/` gains `within` and relative bounds read against the run's now, compact ages ("1d", "3h") and a shared date case table; `record-defaults/` fills a half-written record output from the one plan part that owes records (K5, wired for subflow briefs through `dispatch/scope.ts`); a field the record output's sort or where names stays in the schema, so its dates are stored; `numeric-text/` refuses a spelled-number text test once; `repeat-where/` refuses a lasting repeat over a listing filtered only at run end; `listed-values/` names a field that separates kept from left-out rows (advice).
- Decisions (lead): the separating-field note stays advice until a live round shows marks working; a `within` bound over a value that has only a day compares by whole calendar days (follow-up), since an instant span drops a row dated on the edge day and makes "in the last week" ambiguous.
- Validation: lead-run under the heavy-check lock on the trees merged with dev (t795, t797, t805): contracts `vitest run src/record-sets` -> "Tests 258 passed (258)"; `pnpm test` over nodes, storage/project, flow-bootstrap, llm, project-agents/dispatch, service/candidate-trial, result-verification -> "Tests 1 failed | 7593 passed | 6 skipped", real-sql "476 passed"; the failure was t795's pin that a bare "1d" is no date, which this lane changed on purpose, updated to expect the order claim contradicted -> result-verification "Test Files 181 passed (181)", "Tests 1403 passed (1403)"; prompt contracts "Tests 127 passed (127)"; `pnpm check` exit 0; docs current; structure passed; downstream in its ledger.
- Outcome: Accepted. Follow-ups: one shared run now across page, build test and run end (needs the native node context and executor, after t799); K5 in the dry-run replay and whole-Flow builds; day-granular `within`; the panel's field picker keeps `mark`.

