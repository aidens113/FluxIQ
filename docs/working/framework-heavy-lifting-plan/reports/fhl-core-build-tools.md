# Report: fhl-core-build-tools

R = `!FluxIQ/packages/fluxiq/src/programs/automation-studio/runtime`; paths relative to R. `RUN` = `lab-runs/2026-10-28/run-mvsknffp-153bc89a/steps` (the everything-store kettle run in fhl-step-workload; numbers are step-directory numbers). Read-only; nothing run. Extends fhl-core-surface (not repeated).

## Outcome

Done. Five findings beyond the prior map, each read in source and, where noted, in the run's step files:

1. **Dead brief 2 was a Core defect, not a model one.** The builder wrote `core.describe_element` (real id `web.describe_element`; RUN 0115). `llm/evidence-loop.ts:748` ends the whole loop on any unlisted tool id (`llm_evidence_loop.unknown_tool`), while every other unusable decision (wrong shape, `complete` not offered) is refused and re-asked (`llm/evidence-loop/decision-refusal.ts`). That builder had made 4 calls ($0.0024); the supervisor then spent 2 decides (RUN 106, 116) re-briefing.
2. **Dead brief 1 (about 50 decides) was a witness-vocabulary deadlock.** A press that only navigates (Buy Now to checkout) can be witnessed only by a list read complete, its own control's state, or "a witnessed explored press it repeats" (`flow-bootstrap/reset-admission/admission.ts:46-88`). The exploration door admits an unwitnessed press (t775), so no explored press is ever witnessed, so "repeats a witnessed press" is never true: 8 straight `candidate.trial_step_unwitnessed` (RUN 0025, 0035, 0039, 0061, 0089, 0099, 0142, 0152). Builder 3 cleared it by naming the cart list as "where its effect shows" (decides 0147, 0155, 0163) although the task says the cart is left unchanged: the gate was satisfied by a fiction. The model's `create_new` for Buy Now also contradicts Core's own run_node example ("the press that ... opens checkout is []", `llm/node-tools/run-node.ts:90`), and that declaration is what demanded a witness.
3. **Revision/digest, submit-then-test, complete-after-yes are echoes of state Core holds.** Core already rejects a stale pair and returns `latestRevision/latestDigest` (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts:491-504`); the completion check already uses the latest proposal (`builder-loop.ts:286,325`).
4. **Mid-list cache busting is mechanical and explained.** Diffing RUN packets 0046 vs 0048 and 0064 vs 0066: the first differing entry is an old `core.run_node` result whose page view was rewritten (0046->0048, char 213, `"page":"PAGE ..."` replaced) or whose `extracted` rows became an `extraction` account (0064->0066, char 3387), because a newer view or read arrived (`llm/context-window.ts` header, "A view the target has left is not sent again"; `llm/decision-context/view-groups.ts`). Plain appends match the prior packet to within the last 1-3 entries (0100->0102 first diff at 53 of 55). So the 161k excess miss tokens in fhl-step-workload come from the replace-the-old-view design, not from history churn.
5. **Judge instructions carry scenario-shaped examples** (list below). The build-tool descriptions are clean.

## Responsibilities table

Class: a = needs a model; b = Core can compute/enforce/default generically; c = client-specific. "Contract" = what a client supplies so Core can reason.

| # | Responsibility | Today (tool, arg, file:line) | Class | Generic contract / change | If the model still errs |
|---|---|---|---|---|---|
| 1 | Name a tool that exists | `decision.toolId` must be offered, else loop ends (`llm/evidence-loop.ts:748`; person-facing words `project-agents/stop-reason/stop-reason.ts:25`) | b | Refuse and re-ask with offered ids plus nearest match (same path as `decision-refusal.ts`); counts toward the no-progress guard. No client input | Refused-in-a-row guard ends it after 3, as for other unusable decisions |
| 2 | Copy `revision`+`digest` into `core.test_subflow` / `core.test_candidate` | both required, `additionalProperties:false` (`subflow-trial-gate.ts:437-439`) | b | Make both optional; omitted = latest. Keep the stale check when supplied (`:502-504`). No client input | Stale pair still refused, with latest values already attached (`:503-504`) |
| 3 | Test right after a clean submit | 12 of 19 submits followed by a decide holding only the pair (RUN 24,34,38,60,88,98,141,151,165,184,193,223) | b | `core.submit_subflow` `test:true` (or default): after static acceptance Core runs the same trial gate and returns both answers. Keeps the 3-per-revision cap (`candidate/trial-gate.ts:286`), purse and witness checks | Verdict, judge and standing-no memory unchanged; only the model turn goes |
| 4 | Complete after a yes | echo `{subflowKey,revision,digest}` (`builder-loop.ts:188,280-299,315`); wrong shapes refused repeatedly (header L78-83) | b | When the latest revision holds a yes (whole-run yes on a single-subflow plan, `single-subflow/single-subflow-trial.ts`), Core completes the brief itself. Model keeps `ended: blocked/partial` | `ending_shape` refusals vanish; supervisor still re-checks acceptance |
| 5 | Supervisor plan, dispatch, complete for a one-subflow task | `project.write_plan`, `project.dispatch`, complete (RUN 3,5,106,116,210,233); `read_task` already auto-run (`read-task.ts`) | a for the plan (quotes, answer columns, effect); b for the dispatch | Single-subflow plan (`single-subflow/single-subflow-plan.ts:14-26`): derive one brief over all parts with the default allowance | Quote/`plan_part_dropped` checks stay |
| 6 | Re-brief a dead builder | supervisor writes a new brief (RUN 106 unchanged resend, 116 reworded `recordingExcerpt`) | b | Core restarts a builder once, itself, when it stopped on a Core-caused or provider code (`unknown_tool`, `unreadable_replies`, `provider_unavailable`; list `stop-reason.ts:20-31`), showing the earlier attempt as `stoppedRepeating` does (`dispatch/ending.ts:220,239`) | A second death returns to the supervisor as now |
| 7 | Say where a press's change shows (the witness) | `resetDestination` on `core.run_node` names a list ref (`node-tools/run-node.ts:140-170`; ledger `admission.ts:46-88`) | b (vocabulary) + a (which control) | Client reports per action an observed-effect record: before/after digests of named places, control state, and `placeChanged` (location/page identity). Core adds a witness kind `landing`: the press moved to a new place whose marks differ. Removes the fiction of finding 2 | Trial is judged by change from the pre-trial state; the trial press must show the same landing, else `trial_step_unwitnessed` as now |
| 8 | Declare `consequences` per press | required on every `core.run_node` (`run-node.ts:156-160`), example `:90` | a for the upper bound (permission); b for the floor | Core derives a floor from the effect record (nothing changed but the place = `[]`); model may raise, never lower; `action-permissions/cross-check.ts` already cross-checks. Client may mark an action `irreversible`, which blocks lowering | Permission gate unchanged |
| 9 | `undoes` / `resetDestination` for undo calls | model names the act each undo reverses (`site-reset/undoes-tool.ts:11-40`, `ledger.ts:401-441`) | b | Per fhl-debug-notes class 1: Core infers the act from the press's control and place; model only says "undo" | `gate_unsatisfiable` closure proposed there |
| 10 | Echo `failingReceipt` whole into a repair brief | `project.dispatch` `briefs[].failingReceipt{kind,receiptId,digest}` (`supervisor/tools.ts:62-64`, `dispatch-tool.ts:54,80,318,349`) | b | Brief names `repairs: <subflowKey>`; Core attaches the closest failing receipt | Receipt must belong to that subflow, as checked today |
| 11 | Re-run a node already run in the session | 34 of 104 decides, 18 chains / 55 decides (fhl-step-workload) | a for first runs, b for identical re-runs | `core.run_nodes`: ordered `{node, parameters, target}` already run in this session; stop on first failure or on a `pageChanged` unlike the earlier run; return last page view plus per-step status. Non-lasting only (`rerun-check.ts` verify-only rule stays) | Repeat guard keyed on the whole list (`tool-call-keys`, `repeat-guard/outcomes.ts`) |
| 12 | Choose targets / handles for first runs | `target.handle` from the last page view | a | Not Core's. Stale-handle re-find already exists | n/a |
| 13 | Look / inspect (find_on_page, describe, detect_repeating) | 11 decides; supervisor look budget 3 (`supervisor/look-budget.ts:21`) | a (what to look for), c (the lookups) | Attach element facts to a press result for the handle it acted on (client supplies). Low value | n/a |
| 14 | Write the Flow script | `core.submit_subflow` `flow` (`flow-bootstrap/plan/flow-script-format.ts`) | a | Not removable. Core can write more of it as it already writes handlers and `ensureState` (t775, t787), e.g. `done when:` from a read's end-of-list mark (fhl-debug-notes class 8) | Existing `candidate.*` refusals |
| 15 | Fix a grammar slip after refusal | RUN 201 `web.extract.unknown_key`, then 203/205/207/209 repeats (`candidate.unchanged_after_no`, `repeat_refused`) | b | Refusal already carries `accepted`; add what the node cannot do ("reads whole-element text only") and, on the first `unchanged_after_no`, the diff against the last script plus the one fix point instead of the full `lastTrial` blob (RUN 203 result is large) | Repeat guard ends at 3 |
| 16 | Judge asked twice | 7 of 7 twin judge requests byte-identical, same verdict (fhl-step-workload) | b | Ask twice only when Core's pre-check disagrees with the first answer or the first answer is a first yes; settle a verbatim pre-check yes itself (rows/columns match, each cell a verbatim substring of one end-view element, none refused, checklist done) | Judge still runs on semantic cases |
| 17 | Stage protocol (`llm/stages/*`) | five fixed stages, Core-owned; header says its first production caller is a runtime diagnosis with no tools | n/a for the build | Not part of the build/explore loop as far as I read (headers only). No change | n/a |
| 18 | Looks answered from memory, look withdrawal | `decision-handlers/answer-check.ts`, `look-withdrawal.ts` | b, exists | Already Core-run; keep | n/a |

## Packet content that churns the cache (RUN)

- Cause (finding 4): old entries are rewritten when a newer view or read replaces them (page view to stub; read rows to extraction account).
- Change (b): make every entry append-only. Each result enters the history with its view already a stub naming a trailing slot; the single current view and current read rows ride in one fixed `current` block after `core.evidence_history` and `core.budget`. A new view then changes only the tail. No new client input: the domain already declares which keys are the view.
- Expected: removes most of the 161k excess miss tokens, up to $0.024 of $0.086 (28%) per run; half recoverable is the safer estimate ($0.012). Prefill time not measured.
- Tail entries `core.evidence_history` (5.3k chars) and `core.budget` change every call but sit last, so they cost little.
- `core.route_state` is 15 of 56 entries (17.2k chars at step 104), each repeating the long `state.page.controls`. Class b: send only changed keys against the previous route_state. Hit-priced tokens, so low priority.

## Stage and briefing waste (dead briefs)

- Brief 1 (RUN 8-104, 49 decides, about $0.04 with brief 2): cause in finding 2. Could Core detect it? Yes, at the first refusal (RUN 0025): the step is a navigating press, and Core's own ledger holds only unrelated issued refs. Its `canMeet: "another_page"` plus the instruction "press once naming as resetDestination the list where its effect would show" is untrue for this press. Fix is row 7; failing that, say at the first refusal that no call on this control can meet the condition and offer the honest exits, not at the third repeat.
- Brief 2 (4 calls): finding 1; one conditional.
- Resend 106 unchanged: allowed once for a `stoppedRepeating` return (`dispatch-tool.ts`, return `next` text). Covered by row 6.
- `recordingExcerpt` is used as a free brief field: RUN 116 restates the whole task in it. Model-written, not Core text. Core could refuse an excerpt that has no recording behind it.

## Top (b) changes ranked by effect

1. **Witness kind `landing` and a truthful `canMeet` (rows 7, 8).** Removes the deadlock that cost brief 1: about 50 decides, about $0.04 (45% of this run's model spend) and about 100 s. Same family as fhl-debug-notes mvrj-6916 and mvrj-b6dc (both "Blocked, no Flow"). Needs a client effect record with `placeChanged` and a Core witness kind. Caught by the trial's before/after comparison.
2. **Refuse and re-ask unknown tool ids (row 1).** One conditional at `evidence-loop.ts:748`. Saves brief 2, 2 supervisor decides and the third builder's re-exploration; about $0.01 and 25 s once, plus the chance of a Blocked run. Most reliable change here: reuses existing guards.
3. **Auto-test on submit, auto-complete on yes, optional revision/digest (rows 2-4).** 14 of 104 decides (12 tests + 2 completes), $0.0067, about 24 s. fhl-step-workload's full firm-bookkeeping figure is $0.0131 and about 41 s including refused repeats and the unchanged redispatch.
4. **Append-only evidence with a trailing current-view slot.** Up to $0.024 (28%); about $0.012 is safer. Overlaps 1-3 (fewer calls, fewer rewrites).
5. **`core.run_nodes` for identical re-runs (row 11).** Upper bound 34 decides, $0.0256, 56 s; realistic two thirds: 22 decides, $0.0171, 37 s. Wall-clock gain is model time only (node execution stays, 182 s).
6. **Auto re-brief once for Core-caused stops and derived single-subflow dispatch (rows 5, 6).** 3-4 supervisor decides, about $0.002; the value is removing the supervisor's chance to damage the brief.
7. **Judge pre-check and no twin calls (row 16).** 7 calls, $0.0026, 24 s, plus the false-no side from fhl-debug-notes classes 2-3.
8. **Grammar-slip refusal with fix point (row 15).** 4 decides (RUN 202-208), about $0.005, 15 s.

fhl-step-workload's combined realistic estimate is about 69 calls and $0.047 (55% of $0.086) without changes 1-2; those two remove dead-brief spend that estimate counts separately, so the gain is additive only in part.

## Catalog and instruction text

Long: `llm/diagnosis-instructions.ts:171` is one string of roughly 9,000 characters (result-verification judge) and `:256` another of about 8,000; both ride on every judge call (judge request mean 60k chars, system 24.4k). Each sentence is a conditional ("where present") over summary keys, so ambiguity is high: "name the row in a sentence that also quotes, in double quotes, the request's words" interacts with "leftOutSettled are the one exception" and "leftOutAlsoInResult". Class b: those quote and settle rules are enforced by Core after the answer (the quote guard, fhl-debug-notes mvswh11y F1), so the prose can shrink to the rule and let the guard refuse. The decide-side catalog is within its 2,000-character cap (`run_node` about 1,490 chars, `run-node.ts` header).

Mirrors a realistic scenario (teaching-to-test risk, ranked):
- `diagnosis-instructions.ts:171` "an item sold with or including an excluded part is still the item": matches the everything-store earbuds / ear-tips false pass (fhl-debug-notes mvswh11y). Medium. State the structural rule without a product shape.
- `:171` and `:256` "a count, an item in a cart, a collected coupon, a chosen store" (start-state examples): everything-store / bigbox. Low-medium; use "an item already in a list, a setting already chosen".
- `:171` "A search query ... does not require every candidate's title or name to contain the exact query" and "a numeral may describe only one component or a remainder": the shapes of the everything-store search and pack-count tasks. Medium; generalise or move to Core-computed hints.
- `flow-bootstrap/plan/evidence-schema.ts:115` "saved, added to a cart or list, a coupon collected, a store ... booked, bought, sent, posted": a list of acts across bigbox, job-board, social. Low (acts, not answers).
- `llm/node-tools/run-node.ts:90` "the press that applies a filter or opens checkout is [] and the press that submits the post is send_or_publish": "checkout" and "post" echo everything-store and social-network-feed; the comment cites t195-w18. Medium. Its checkout half did not even bind the model in this run; replace with row 8's derived floor.
- Not found: any task, product or site name in model-facing strings of the Area (grep for kettle, earbud, coupon, auction, classified, job board, scenario names, "Buy Now", "pinned", "remote": hits only in comments and tests). The judge's deliberate examples (library, books on loan, Return button) are a different kind of site, as the rule requires.

## Risks

- Landing witness (row 7) changes the trial's proof of what changed. A press that lands on a page whose marks are the same before and after (a duplicate action) must not count as witnessed; the comparison must be strict, and the per-pass witness and `contradicted` proofs (fhl-debug-notes classes 1, 6) should land first or with it.
- Auto-test and auto-complete (rows 3, 4) change who spends the 3-per-revision cap and the purse; `subflow.trial_unaffordable` (UNAFFORDABLE in `subflow-trial-gate.ts`) must still stop a trial before a judge call.
- Batch (row 11) can walk past a state the model wanted to see; keep it to identical-parameter, non-lasting nodes and stop on any changed result code.
- A re-askable unknown tool can add up to 2 wasted calls for a model that cannot name tools; bounded by the refused-in-a-row guard.
- Append-only evidence changes what the model reads (a trailing view). The t194/B1 history shows models act on whichever view they see; a test like `evidence-loop/tests/request-prefix.test.ts` should assert byte-prefix across a view replacement, not only across appends.
- The row 8 floor is safe only if the client can mark an action `irreversible`, so a purchase-like press is never lowered.

## Not verified

- One run (RUN) only, read through decision summaries, a few results and request diffs. Brief 1's cause rests on the `no_witness` codes (8 times), the admission source and the builder-3 summaries; I did not run the admission code or open a ledger trace of why `repeatedAct` never found a witnessed press.
- I did not open `evidence-loop/tests/request-prefix.test.ts`, `decision-context/view-groups.ts` or the domain's view-key declarations, so the append-only design is a proposal from the header text and packet diffs, not checked against the code that writes stubs.
- `llm/stages/*`, `decision-handlers/*`, `rerun-arguments/*`, `tool-call-keys/folded.ts` were read at headers, not bodies. Whether auto-test would collide with the 3-trial cap is read from the prior map only.
- fhl-step-workload step numbers and RUN directory numbers differ by one in places; I cite directory numbers.
- Savings are fhl-step-workload's figures or one-run arithmetic; none re-measured or prototyped.
