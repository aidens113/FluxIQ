# Report: fhl-core-runtime

R = `C:/Users/osrs_/FluxStuff/!FluxIQ/packages/fluxiq/src/programs/automation-studio/runtime`. Paths are relative to R. Line numbers are those of the declaration (read, not run). Extends `fhl-core-surface.md` (read-only; nothing built or run).

## Outcome

Done. The runtime is already mostly Core-owned and deterministic. In a saved Flow's run the model is asked in exactly two places, both late: the in-run repair of a true failure (once per incident), and nothing else. The real model load sits in what the build authors and in what Core must be told by the client. Five findings:

1. **Interruption handling is learned per step, not per layer, and only after a defence close.** `learnAutomationStudioInterruption` writes a handler scoped `{kind:"nodes", nodeIds:[thisStep]}` (`service/runtime-session/interruption-handler.ts:46`, key `interruption:<graph>/<node>:<name>` at `executor/step-loop/incident-repair.ts`). The same layer at the next step is learned again, or not at all. A layer that blocks a step and the client did not close goes to the model or fails.
2. **The ladder's `clear_interference` rung is dormant.** It needs a Flow node with `metadata.clearsInterference === true` (`executor/ladder-run.ts:11,153`). Nothing in Core src writes that key (grep: only readers in `ladder-run.ts`, `lifecycle/graph-registrations.ts`, `lifecycle/registration.ts`, `model/validation/flow.ts:157`). So a covered-target failure skips straight to retry, then fail/repair.
3. **"Lasting act" is a model self-report.** `automationStudioNodeActLasts` (`executor/defensive/lasting-act.ts:54`) reads `metadata.declaredConsequences`; `[]` means "none", so a press the model declared `none` is retried like a read, and is never effect-checked. The domain's `effect: ambiguous` on the failure record is the only client voice.
4. **Re-acquire reaches only bound targets and runs late.** Lineage exists only when a parameter is bound to another step's output or a loop row (`executor/target-reacquire/lineage.ts`). It runs once, immediately before attempt 4 (`before-attempt.ts:10`), after 3 failed dispatches and about 3.25 s of backoff. A literal target (handle) gets nothing.
5. **Pace is learned only from a wait hint.** `pace-keeper.ts` `learn()` needs `hintedWaitMs` (retryAfter). A rate-limit notice without a hint raises nothing; the model is told to write `repeat pace:` (`flow-bootstrap/plan/flow-script-format.ts` L~423).

## Responsibilities table

Class: a = needs a model, b = Core can compute/enforce/default (with the contract a client supplies), c = client-specific.

| # | Responsibility | What the model does today (file:line) | Class |
|---|---|---|---|
| 1 | Retries per node (first + 3, 250/1000/2000 ms) | Nothing. Core: `executor/retry-policy.ts:44`; build-time single nodes `executor/outside-graph/retries.ts`. Container (Call Subflow) gets 1 (`:54`). | done (Core) |
| 2 | Retry or refuse after a fault | Nothing. `defensive/assess.ts:54` orders classified fault, producer record, message text; gates refuse a repeat of an act found after acting or of unknown effect. | done; message-text reading is (b), see 9 |
| 3 | Is an act lasting (never blindly repeated) | Model declares `consequences:` per press/submit; Core stamps `declaredConsequences` (`flow-bootstrap/adaptation.ts`), read at `lasting-act.ts:54`. `none` = freely retried. | **b** (item B3) |
| 4 | Effect check of an uncertain act | Nothing. `defensive/effect-check.ts`, `step-loop/failed-attempt.ts` ~L96-104: host evaluates the node's expected state. Needs a recorded expected state, which the build produced. | done; coverage depends on 3 |
| 5 | Stale target re-find | Nothing at run time, but only for bound targets (`lineage.ts`), only source steps that are read-only and re-runnable (`step-reacquire.ts:77`), only before attempt 4. Unmatched/ambiguous falls back to the old binding. | **b** (B4) |
| 6 | Absent-step skip (popup, banner) | Model writes `optional: yes` or `sometimesPresent` (flow-script-format L~281); Core skips on `target_not_found` (`step-skip/absent-step.ts`, `optional-step.ts:36`). | **b** (B5) |
| 7 | "Did the skipped step do a lasting act" | Core reads English words of the step's control or label (`step-skip/act-not-done.ts:26` via `automationStudioInstructedActWordsNameLastingAct`). | **b** (B3/B5), language-bound |
| 8 | Route by page state when a step cannot run | Nothing. `state-routing/decision.ts:102`: effect-holds, pre-state match, reopen opener; guards: facts, skipped-value, repeated lasting act, 3 returns without progress (`progress-guard.ts:9`). Pre-states come from the build's `before`/`after` signatures. | done (Core); host signs state (c) |
| 9 | Read a failure out of free text | Core regexes message/code words: `defensive/result-message.ts`, `thrown-error.ts` phrases, `llm/repeat-guard/retry-later.ts:7` (rate limit, busy, loading, disabled...). | **b** (B7) |
| 10 | Handler authoring for an interruption (build) | Model writes `optional:` vs `on before everywhere:` handlers and picks the way out (flow-script-format L~541-546). Core auto-adds a handler for each layer exploration closed (`flow-bootstrap/layer-handlers/explored.ts`, every part but recovery). | **b** (B1) |
| 11 | Handler authoring (run time, defence closed a layer) | Nothing: `service/runtime-session/interruption-learning.ts`, no model. Requires name + wayOut handle + wayOutDefinitionId (`incident-repair.ts` `learnable`); scope is the one step (`interruption-handler.ts:46`); one learn per step and name. | **b** (B1) |
| 12 | Layer blocks a step, client did not close it | `clear_interference` rung dormant (finding 2). Next: retry (covered fault `effect: unacted`), then On Fail, then in-run repair by model. `state-routing/could-not-run.ts` deliberately excludes covered. | **b** (B1) |
| 13 | Toggle / ensure-state | Model writes `check`/`select` or a press; Core auto-writes `ensureState` for explored toggles (`toggle-idempotent.ts`), domain answers `already_in_state` and Core records it (`node-execution/already-in-state.ts:38`). A plain press on a state control never explored is not caught. | **b** (B6) |
| 14 | Completed-act ledger (never repeat a lasting act) | Nothing. `step-loop/already-done.ts`, `lifecycle-run/act-identity.ts`. Keyed by row or resolved target plus inputs. | done |
| 15 | Loop no-progress | Nothing. `repeat-progress/no-progress.ts:42`: 3 passes in a row with no new stored row and no host state-diff movement. Needs the client's `stateDiff`. | done; contract = diff (c) |
| 16 | Repeat of a failed or no-effect call | Build-time only: `llm/repeat-guard/outcomes.ts` refuses an identical call on an unchanged page. Run time has no equivalent: a Flow step repeated by a loop is bounded by the act ledger, the `repeat most` bound and the 3-pass no-progress rule. | build: done; run: see B8 |
| 17 | Pacing after rate limits | Model writes `repeat pace:` and `paceMs` on a node; Core learns more from `hintedWaitMs` only (`pace-keeper.ts`, `sustainable-pace.ts`), caps at 60 s (`:46`), keeps it for the run, carries a trial's learned pace into the saved Flow (`candidate-trial/learned-paces.ts`). | **b** (B2) |
| 18 | Repair trigger | Nothing decides it but Core: true failure only (`failed-attempt.ts`), never in a handler body, never on permission category (`incident-repair.ts:22,175`), never past an uncertain act, never for `executor.target.gone`; one ask per incident; a held fix that fails again is dropped. | done; the model fixes (a) |
| 19 | Repair context | Model receives: unit contract (node, handler or part), authored parameters screened, flow graph in full (`repair-context/flow-graph.ts`), incident ids, `recoveriesTried`, `actsCompleted` (`in-run-repair/history.ts`, ids and codes only), plus a bounded gather/iterate exploration through the domain's recovery tools (`annotation/exploration.ts`). No dismissed-layer record, no pace, no stale-target record unless carried as a recovery entry. | **b** (B9) |
| 20 | Permission gate | Model declares per-action consequences; Core gates only `move_money`, `delete`, `send_or_publish` (`action-permissions/destructive.ts`), fail-closed, cross-checked against instruction (`cross-check.ts`, never refuses). Repair patches pass the same gate (`annotation/permissions.ts`). Person-needed ask is Core's (`person-needed.ts:38`). | **b** (B3), semantic class stays (a) |
| 21 | Failure survivability (continue past a failed node) | Nothing. `defensive/continuation.ts:30`: a fixed table over failure classes; the author may force `continue`/`stop`. | done |
| 22 | Provider retry | Nothing. `llm/provider-retry/*` (3 attempts, 1/3 s, 5 s cap, 120 s per run). Not client-environment related. | done, out of scope |
| 23 | Build and exploration loop bounds | `loop-limits/*` (64 iterations/calls), `recovery/progress-guard.ts` (3 steps without new evidence). Core's. | done |
| 24 | Composite (Call Flow/Subflow) boundary | Nothing. `composite-execution/boundary.ts`: typed inputs, child bounds. Model never. | done |
| 25 | Durable behaviour change | Nothing. `durable-behavior/durable-behavior-changed.ts`: a held fix or re-author kept only after a judged answer. | done |

## Top (b) changes ranked by effect

### B1. Layer-centred interruption handling from a client contract (effect: high)

Contract the client supplies, in the same place it reports actionability: `obstruction: { id|name, kind, covers: targetRef, dismiss: [{controlRef, actionDefinitionId, commits: false}] }`, on every failed or covered attempt, and `clearedLayers` (already there, `cleared-layers.ts`) for closes it made itself. The kind vocabulary stays closed and generic (`overlay|notice|rate_limit|assistant|other`).

Change:
- (i) On a failure that carries a covering `obstruction` with a non-committing `dismiss`, Core runs the dismiss itself as the `clear_interference` rung (run the control, re-wait for the target, attempt again, return to the failed step), with no Flow node needed. Today `ladderCandidates` (`recovery-ladder.ts:164`) takes `interferenceNodeId` only from a `clearsInterference` node nobody writes.
- (ii) Widen the learned handler from one step to the part, or graph: scope `{kind:"part"}` or everywhere, keyed by layer identity (name or kind plus dismiss control), so one observation covers every later step. Today the key is per step and name (`incident-repair.ts`, `learn`).
- (iii) Drop `LAYER_FACT = "dialog"` from the handler's condition (`interruption-handler.ts:40`): the condition becomes `obstruction visible/absent` through the same contract, so a mobile sheet or a desktop modal needs no web word.
- (iv) At build, treat any dismiss the client reported while exploring as already done by `layer-handlers/explored.ts`; no change, but let it use the same obstruction identity.

Wrong choice is still caught: (1) the handler declares no lasting consequence and the client states `commits:false` (Core already refuses a way out whose press commits: `way-out-steps.ts`); (2) `completionCheck: obstruction absent` fails the handler and the incident goes to On Fail then repair as now; (3) `alreadyHandled` prevents duplicates; (4) `maxRuns` and the state-route guard bound loops; (5) a layer dismissal that took an offer shows as a changed state diff and a judged answer.

Evidence: mvskptb1 playback met a dock the build collapsed once and had no handler, in-run repair failed (fhl-debug-notes s.7; 0143-0144); mvrj-6916 cause 2 closed a chat by pressing a launcher. mvswh11y shows model-free recovery handled both dialogs. No measurement of how often a covered step reaches the model today; the step-level trace (`attempt.recoveryDecision`) would give it.

### B2. Default pace from a client rate signal; persist it (effect: medium-high for lists and bulk acts)

Contract: the failure record or an `obstruction` of kind `rate_limit` (already a kind: `cleared-layer.ts`) with optional `retryAfterMs`.
Change: a `rate_limit` signal with no hint raises the node's pace by the existing growth rule (x1.5 from a 1 s floor, capped 60 s) instead of nothing; `pace-keeper.learn` accepts `hintMs` undefined when `kind: rate_limit` is set. Promote every learned pace into the saved Flow the way a judged trial's is (`learned-paces.ts`, `adaptation.ts:250`), so the model need not write `repeat pace:` (flow-script-format L~422-423 becomes advisory). Add one default of 0 for a first act.
Wrong choice caught: learned pace is bounded (60 s), the run's wait budget (`automationStudioRunMayStillAbsorb`) and wall clock bound the cost, and a pace too short is refused again and grows; too long only costs time. Evidence: lane D round 12 (`pace-keeper.ts` header, t378/t485): 3 acts per 15 s, playback refused again. Not measured: how often a notice lacks a hint.

### B3. Take the client's action effect as the floor for "lasting" and for the gate class (effect: high for safety, medium for build load)

Contract: per action kind the client declares `effect: observe|state|commit` and `idempotentWith` (the idempotent counterpart, already in the web domain), plus the permission class when it can tell (checkout, delete, send).
Change: `automationStudioNodeActLasts` and the gate's class use `max(model, client)`: a step the client says commits is lasting whatever the model wrote. Core keeps the model's finer class for permission (money vs send is semantic, class (a)). The model then declares only where the client cannot tell (prior report item 6).
Wrong choice caught: cross-check already compares declarations to the instruction (`cross-check.ts`); an over-strict `commit` costs only a retry skipped and an effect check (which needs a recorded expected state); the block is on retry, not on running.
Evidence: `lasting-act.ts` header (t359: a lost acknowledgement pressed again adds a second cart item); mvrj-6916 and mvskptb1 declared steps whose consequences did not match. No measurement of a mis-declared `none` in a live run in the files read.

### B4. Re-acquire from identity, earlier, for every target (effect: medium)

Contract: the client reports stable target identity at every dispatch (already: element fingerprint, `reacquireTarget` on `host-runtime.ts:215`) and answers `reacquire(identity, currentView)` without a source step.
Change: when a failure is a lost target with no act, Core asks the client to re-find from the stored identity on the current view first (no source rerun, no place navigation), at attempt 2, not 4. The source-step path stays for row-bound items where identity is the row key. A `gone` answer ends the step (`executor.target.gone`) as now.
Wrong choice caught: an act is dispatched only when the client's match is unambiguous (existing `ambiguous` outcome); effect check follows; the repeat-act ledger blocks a second lasting act.
Evidence: t786 comment: re-find is already measured to work for bound targets; literal-handle targets have no coverage by construction (`lineage.ts` returns undefined). Time saved per stale step about 3.25 s of backoff plus 2 dispatches; not measured live.

### B5. Derive "optional" from layer membership instead of model flags (effect: medium)

Contract: the client marks a control as belonging to an obstruction (the control is a dismiss of a layer) in the same view report.
Change: a step whose target is a layer's dismiss control, and which declares no lasting consequence, is implicitly sometimes-present: Core skips on `target_not_found` without the model writing `optional: yes`. Replace `act-not-done.ts` English-word check with the client's `effect` (B3): skipped-step "not done" is then true whenever the skipped step's declared effect is `commit` or `state`. No word list, works in any language.
Caught by: the not-done record already stops a skipped act silently passing (r4b F4); the judge still sees the answer.
Evidence: flow-script-format guidance L~281-282, `act-not-done.ts` header: R4a collected a coupon only on an optional step.

### B6. Ensure-state for any stateful control, before the press (effect: medium)

Contract: the client reports `stateful: true` and the current chosen state on each control in the view, and answers `already_in_state` on request (already done after a press).
Change: Core decides the press is an ensure-state (rewrite to the idempotent counterpart, or skip when the current state is the asked one) for every stateful control, not only explored toggles (`toggle-idempotent.ts`). Prior report item 14 requested submission-time; add the run-time read so a saved Flow on an account that already has the state skips the press (stateful repeat of a like in a loop, mvskptb1 0119, 0126).
Caught by: the effect check and trial witnesses; a wrong "already" is visible as a missing change.

### B7. Stop reading English in failure text (effect: low-medium, robustness)

Contract: the failure record already has `retryable`, `effect`, `retryAfterMs`, `category`, `stage`; make them the required set for clients, with a `transient: true` flag. Core stops parsing `RETRY_LATER` (`repeat-guard/retry-later.ts:7`) and message phrases (`result-message.ts`, `TRANSIENT_PHRASES`), keeping the node/undici codes for API clients. Caught by: unknown shape defaults to the cautious answer (assess.ts). Evidence: none live; it is a portability fix for non-English sites and non-web clients.

### B8. Run-time repeated-failure guard (effect: low, parity)

The build loop refuses a repeat of a failed or no-effect call on the same page (`repeat-guard/outcomes.ts`); a running Flow has only the act ledger, the 3-pass no-progress rule and the state-route return limit. Add the same keyed record (node, resolved target, inputs, view digest) to the step loop so a loop that retries the same failing step with an unchanged view ends after 2 repeats with `repeat.no_progress`-style code and a repair, instead of 3 passes. Contract: the view digest the client already reports in `stateDiff`. Caught by: only blocks identical input on an unchanged digest.

### B9. Give repair the record Core already holds (effect: medium for repair quality)

`in-run-repair/history.ts` sends ids and codes only. Add: the obstructions seen and dismissed in the run, the paces learned, the re-acquire records (`attempt.reacquire`), the state-route records with refusals, and the last client view of the failing step (already packetised as failure evidence). Caught by: repairs are judged at the run end (`durable-behavior`, `judged-promotion`); `mayAsk` limits stay.

## Client concepts in Core

Behind a client contract these should become generic names (no behaviour change):

- `ClearedLayerKind` = consent, rate_limit, promotion, assistant, dialog (`executor/node-execution/cleared-layer.ts:13`) and the payload key `clearedLayers` read from `outputs.result` (`cleared-layers.ts:19`): a closed web-flavoured vocabulary. Keep `rate_limit` and `other`; map the rest in the client.
- `LAYER_FACT = "dialog"`, fact ops `visible/absent` with value = layer name (`service/runtime-session/interruption-handler.ts:40`).
- `controls.location` and "page address" (`executor/executed-locations/locations.ts`, `trace-withholding.ts`): a web address; desktop/mobile need `place`.
- `outputs.result.result.resolution.shown === false` as the "measured, not shown" signal (`state-routing/target-not-shown.ts`): the path is a web domain's output shape; make it a top-level field on the failure record.
- `target_not_found` / `target_ambiguous` categories drive skip, reopen and re-acquire; fine as generic, but only `shown:false` separates "not there" from "not shown".
- English vocabulary: `automationStudioInstructedActWordsNameLastingAct` at run time (`act-not-done.ts`), `RETRY_LATER`, message phrases.
- User-visible strings: "the page already shows what it does", "the page went back" (`state-routing/announcement.ts:24-29`), "page" in activity text; use "view" or "state".
- `ROW_NAME_KEYS = name,title,label,text,heading` (`candidate-trial/absorbed.ts:32`) for naming a row; harmless but web-table shaped.
- Prompt text and examples in `flow-bootstrap/plan/flow-script-format.ts` name `web.dom.select` and `web.dom.check` (out of my area; see prior report).
- Good already: `reacquireTarget`, route signatures (host-signed), `ensureState` (domain's word), `wayOutDefinitionId` (domain names its press), `stateDiff`, transport codes (Node, valid for API clients).

## Risks

- B1 widening scope can dismiss a layer at a step where it is wanted (a modal the task needs). Mitigation: a `commits:false` dismiss, a scope of the part only after two observations, and no handler for a layer whose id equals a control the Flow itself presses.
- B3 raising a model `none` to lasting disables retries for steps that were safe to repeat, adding failures that were absorbed before. Mitigation: only `commit`, never `state`, and effect check first.
- B2 default pace slows runs that never meet a limit: only after a `rate_limit` signal, never on a guess.
- B4 earlier re-acquire runs a client round trip on every first stale failure; it spends no attempt (like t786).
- B6 pre-reading state needs a current view per press; cost in time on slow clients.
- Teaching to the test: all changes are mechanical and generic. Layer names in tests must come from a different kind of site (the guidance rule).
- Persisting learned paces and handlers changes saved Flows: they stay behind the judged-promotion gate (`durable-behavior`).
- Mobile/desktop: "dismiss control" may not exist (system back); contract allows `dismiss: [{action:"back"}]`; unmatched means no rung, as now.

## Not verified

- No run, test or build. Behaviour read from source and comments only.
- Whether any domain code writes `clearsInterference` (searched Core src only; `!FluxIQWebExtension` not searched).
- Whether `llm_diagnosis` ladder rung is ever selected in a graph run (`ladder-run.ts` body not read in full; `allowLlmDiagnosis` option); in-run repair is the confirmed model path.
- `annotation/annotate.ts`, `patches.ts`, `exploration.ts` bodies (775/378/475 lines) read by header only: the exact repair context sections and the exploration tools were not enumerated.
- `route-state/signatures/*`, `parking/*` (ask and park), `composite-execution/*`, `recovery/exploration-state/*` skimmed or by header; no responsibility found there that the model carries.
- No live-run frequency for any (b) item; evidence lines are from existing reports and code comments.
