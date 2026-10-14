# t538 — A4b: subflow partial trial (validator side)

Worker report. Worktree `fxwork/t538/!FluxIQ`, branch `task/t538-subflow-partial-trial`. Nothing committed.
Paths below are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. All four parts of the brief are built and tested. The supervisor's mid-task note (a target with an interface is called through the boundary; a target without one runs as a root frame) is also handled. The typecheck, the structure audit and the tests in every directory I touched pass.

## What changed and why

**(1) `flow-bootstrap/verification/detached-subflow.ts`** (new, exported from `verification/index.ts`): `runAutomationStudioDetachedSubflow`.
- **Design: a throwaway root graph of Call Subflow steps, as offered.** The predecessors' latest proposals and the target's proposal are put together into one small plan. Its primary is a root `subflow-trial-root`: `start`, then one `builtin.control.call-subflow` per predecessor in order, then the target, chained on `success`.
- **Reuse is by construction, not by copy.** The composed plan is handed whole to the unchanged `runAutomationStudioDetachedCandidate`. Everything the brief listed therefore runs here exactly as in that runner: the identity and freshness checks (re-read at every child load), plan validation and normalization, the t529 `automationStudioCandidateGraphSource` with no accepted-graph fallback, the root invocation, and each graph's own failed-route budget. `detached-execution.ts` and its partial refusal are untouched.
- **Each part crosses the C1 boundary.** Its typed inputs and outputs cross there, and its own `fluxiq.successCheck` is checked when its frame ends.
- **Inputs come from earlier outputs.** Each input a part declares is bound to the latest earlier part that declares an output with the same id. A required input that nothing earlier produces refuses the trial before anything runs (`subflow.execution_input_unbound`).
- **A proposal subflow that the plan made `primary` is called as a `utility`.** A primary takes the Flow's interface in `adaptation.ts`, so this keeps the part's own interface.
- **Supervisor note (decided with t537): a target with no interface runs as a root frame.** The predecessors' calls run first as a throwaway root. Only if all of them succeed does a second detached run start, with the target as the primary and the run's own inputs. The two runs are returned as one result: one receipt (node counts added together), one trace in run order, one merged graph, and the candidate graphs combined. A predecessor with no interface is still called through the boundary with an empty interface.
- **The identity is bound to the partial trial.** `{projectId, flowId, buildId, briefId, planDigest, baseDependencyDigest, target ref, predecessor refs}` is hashed into the candidate-identity digest (`automationStudioDetachedSubflowCandidateIdentity`), and the plan digest goes in the `requirementsDigest` slot. Two briefs, or two predecessor revisions, never share a receipt identity. A proposal that does not match the identity is refused (`subflow.execution_identity_mismatch`).
- **The result** is `partial: true`, plus:
  - `entryPrepared`: true only when every predecessor's call succeeded and the target then started.
  - `failedPredecessor`.
  - `planIssues`: the validation codes, for example `bootstrap.unknown_call_target` when the target calls a subflow outside the composed plan.
- **Cycle note.** `detached-execution.ts` is already in a baselined import cycle (through `route-state` and the `flow-bootstrap` barrel). A static import would have pulled this module into that cycle, and the `import-cycles` rule failed. The runner is therefore loaded with `await import("./detached-execution.ts")` inside the function, with a type-only static import. This is commented in the code.

**(2) `service/subflow-trial/`** (new: `types.ts`, `run.ts`, `port.ts`, `index.ts`; not re-exported from `service/index.ts`, same as `candidate-trial/`).
- **`runAutomationStudioSubflowTrial` checks before running.** It refuses a proposal that is not bound to the request's scope (`subflow.trial_identity_mismatch`). It then reads the injected `predecessorProposals(scope)`. If one is missing or belongs to another plan, it refuses with `subflow.trial_predecessor_missing` or `subflow.trial_predecessor_stale` and opens no session.
- **The start reuses the whole-candidate code.** It goes through `automationStudioCandidateTrialStart`; `startPorts` strips the scoped judge and the partial runner from the ports first.
- **The session is marked as a subflow trial.** It opens with `metadata.subflowTrial = {buildId, briefId, subflowKey, revision, digest}` and never `adaptiveRuntime` (a test asserts both this and that `candidateTrial` is absent). It ends with the execution status, `entryPrepared` and the code added.
- **Freshness is checked again during the run.** It re-reads the predecessor proposals, the optional `currentPlanDigest(buildId)` and `currentBaseDigest()`. A predecessor replaced mid-run stops the trial with `candidate.execution_stale`.
- **The candidate-trial helpers are imported, not copied:** feedback (`executionFailed` / `judged`), summary, landed acts (the predecessors' acts are included) and frame evidence.
- **A failed predecessor** gives `subflow.trial_predecessor_failed` with `failedPredecessor` and an `entry` sentence in the feedback. The judge is not called.
- **The injected scoped judge** gets exactly `{ summary, scope }`.
- **The result** is the contract's `AutomationStudioSubflowTrialResult` (`partial: true`, `scope: "subflow"`).
- **The port** is `automationStudioSubflowTrialPort(buildId, ports)`, one per build. It refuses another build's request (`subflow.trial_other_build`) and keeps `records()` and `spent()`. Concurrent calls each get their own run id.

**(3) Project ledger.**
- **`site-reset/ledger.ts`:**
  - An optional constructor `options` with `owner`, `nextActId` and `sink` (`AutomationStudioSiteResetLedgerOptions`, `AutomationStudioSiteResetRecordedAct`). With no options it behaves exactly as before; the old `ledger.test.ts` is unchanged and passes, 29 tests.
  - **This goes beyond "constructor only":** for the options to have any effect, `record()` had to change by about four lines. It takes its id from `nextActId` when one is given and calls `sink`. No other method changed.
- **New `site-reset/project-ledger.ts`, `AutomationStudioSiteResetProjectLedger`:**
  - `forBrief(briefId)` returns a real ledger, the same one each time it is asked for the same brief.
  - Act ids `act-N` come from one counter across the whole build, capped at 9999 as before.
  - A brief can claim, target and see only its own acts. The "line another act added" check in `stillThere` therefore covers only the brief's own acts; a test shows a single ledger admitting where the per-brief ledger refuses.
  - One serialized writer: the optional `persist(snapshot)` port is called one write at a time, in order. Later writes still run after a failure; the first failure is thrown from `flushed()`.
  - `snapshot()` lists every act with its owner and `inPlace`.

**(4) `service/runtime-session/build-trial-admission.ts`** (new, exported from `runtime-session/index.ts`): `admitAutomationStudioBuildTrialSession(ports, {buildId, briefId, lease})`.
- It refuses when there is no lease, when the lease is held by another brief, or when the build is unknown.
- It then calls `assertCurrent` from `project-agents/host-resources/` after the build lookup's await, so a lease released during the lookup is still refused.
- It has no per-project count, so a capacity-2 host admits two trials at once.

## Commands run and observed results

All run in `fxwork/t538/!FluxIQ`, final state:
- `node scripts/structure-audit.mjs` → `structure-audit: passed (345 warning(s), 1156 baselined).` None of the warnings are on my files.
  - An earlier run failed: an import cycle in `detached-subflow.ts`, and statement packing in two test files. Both are fixed.
  - `ledger.ts` reached 403 lines (an advisory warning only) and was trimmed to 396.
- `cd packages/fluxiq && npx tsc --noEmit -p tsconfig.json` → no output, exit 0. An earlier run had 3 errors (a port type mismatch in `run.ts`, a failure category in a fixture, an implicit `any[]`); all are fixed.
- `npx vitest run` over `flow-bootstrap/verification/`, `flow-bootstrap/site-reset/`, `service/subflow-trial/`, `service/runtime-session/` and `service/candidate-trial/` → `Test Files 49 passed | 1 skipped (50)`, `Tests 448 passed | 2 skipped (450)`. The skipped file is `process-restart.test.ts`, which was already skipped and is not mine.
  - New tests: `detached-subflow` 11, `project-ledger` 6, `subflow-trial` run 7 and port 1, `build-trial-admission` 4.
  - `detached-execution.test.ts` still passes, including its existing partial-option refusals (37 tests).

## Definition-of-done mapping

| Brief item | Test that covers it |
| --- | --- |
| Predecessors run before the target, from the candidate source | `detached-subflow`: first case and the router-run cases |
| A subflow outside the topology fails, and accepted graphs are never read | `detached-subflow`: a counting accepted-graph source reads 0 times |
| A failed predecessor stops the target | `detached-subflow` and `subflow-trial/run` |
| Identity or staleness refuses | `detached-subflow`: before the start and during the run; `run`: identity mismatch and a predecessor replaced mid-run |
| `detached-execution` still refuses partial options | its own existing tests, plus a case here showing `startNodeId` is refused through the partial entry |
| Session metadata and the injected judge | `run`, first case |
| `partial: true` result with predecessor acts | `run`: `acts` length 2 on success, 1 when the target fails |
| Project-ledger cases, with the old ledger tests unchanged | `project-ledger` (6 tests); `ledger.test.ts` untouched |
| Admission refuses a stale or missing lease and admits two at once on a capacity-2 stub | `build-trial-admission` |

## Not verified

- Nothing calls these modules yet. There is no wiring into `service.ts` and no real judge; that is A5's job.
- No live browser or Lab run.
- I did not run the full `pnpm check`, `pnpm test`, or other packages, in line with the narrow-check rule.
- A success check failing at the end of a part's frame inside a partial trial is relied on through the reused C1 boundary. I did not test it separately.
- The way the router-run target's two runs are merged into one result (trace, graph, receipt) is exercised only with the echo test node, not with real domain nodes or saved traces.
- Re-asking a judge that did not judge (the whole-candidate port's t473 behaviour) is not implemented for partial trials. A `not_judged` result is returned as it is.

## Open questions or contradictions found

1. **"Reuse its identity and freshness checks …" against "must not touch `detached-execution.ts`".** Those checks are inline and not exported there. I reused them by calling the whole runner on the composed plan rather than copying them. If A5 or a later unit wants them as standalone helpers, extracting them means editing `detached-execution.ts`.
2. **`ledger.ts` "constructor only"** could not be met literally. `record()` changed by about four lines so that `nextActId` and `sink` take effect (see (3)).
3. **The start hook** (`prepareStart`, D1) runs once per partial trial, as it does for a whole-candidate trial. With capacity above 1, a deployment hook that resets the whole site would need to know which host resource to reset. The hook contract has no lease parameter, so this needs a decision before running with concurrency above 1.
4. **Wiring for A5:**
   - `predecessorProposals(scope)` has to return proposals in `scope.predecessors` order.
   - `currentPlanDigest` is optional. Without it, the scope's own digest counts as current, so a plan amended in the middle of a trial would only be caught through the predecessors.
   - `admitAutomationStudioBuildTrialSession` is not called inside `run.ts`. The service should implement `openSession` through it, so that each trial's session is admitted against the lease.
5. **The `runtime-session/index.ts` header comment** does not mention build-trial admission. I owned only the export line there, so I left the comment alone.
