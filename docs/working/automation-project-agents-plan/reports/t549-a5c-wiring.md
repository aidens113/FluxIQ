# t549 A5c: project mode wiring (report)

Worker label: t549-a5c-wiring. Worktree `fxwork/t549/!FluxIQ`, branch `task/t549-project-mode-wiring`. Nothing is committed.

## Outcome

Done. A build with authoring mode `project` now runs through the project supervisor (A5a) and the real dispatcher (A5b). The candidate branch of `generateFlowBootstrapAdaptationInternal` hands the project build the same input the candidate draft generator gets, plus the project's own ports. `candidate` is still the default.

A service-level test drives a scripted model through the whole path:

- plan, dispatch, builders, subflow trials, assembly, the whole trial, and promotion;
- a judged yes gives a proposal, and a judged no keeps the assembled candidate as a draft;
- at host capacity 2, two independent builders hold leases at the same time (most held = 2);
- at capacity 1, they run one at a time.

`service.ts` is still 4333 lines, its baseline. All four narrow checks pass.

## What changed and why

Paths below are relative to `packages/fluxiq/src/programs/automation-studio/`.

**New `runtime/service/project-build/`** (16 source files: just over the advisory 15; see Open questions):

- `run.ts`, `runAutomationStudioProjectBuild(project, draft)`.
  - It takes the candidate draft generator's own input (`draft`) and returns what that generator returns, `{ record, trial }`.
  - It builds:
    - one record store;
    - one host scheduler per host port (`automationStudioProjectHostLeaseScope`);
    - the dispatcher, with a per-brief port factory and a `maxCalls` sizing;
    - the build's subflow trial port;
    - the supervisor's ports and loop.
  - The supervisor's decisions run under the build-level routing (`draft.runHarness`, `draft.wrapDecision`).
  - The reserve is the judging pair (2 calls, using the purse's judge reserves).
  - Endings:
    - A completion on a yes saves the draft, with that trial for promotion.
    - An honest ending or a stop that has an assembled candidate keeps the draft, and drops any yes so that nothing promotes.
    - With no candidate, the build fails with the loop's own failure. If the loop completed, it fails with a phase failure carrying `project.build_<outcome>`.
    - A cancel throws an AbortError.
  - A repair's re-author (`repair: true`) is refused.
- `brief-ports.ts` (per brief, once the lease is held). Each brief gets its own:
  - harness options and node descriptions;
  - build routing (`first_look`);
  - permission gate:
    - its siteReset is the brief's own ledger, or for a reset brief the routing calls below;
    - its permitted consequences are the build's, cut down to `brief.permittedActs`;
  - person-needed, under the brief's signal;
  - decisions, under the loop's own completion schema (set in `observe`).

  Builders also get the build's subflow trial port, wrapped so that each trial's own lasting acts are recorded in the brief's ledger (`trialRan`). Reset briefs get:
  - `undoes` on their run-node tools;
  - a start check;
  - `remainingActs`, which runs `beforeTrial` on every ledger that still holds an act in place and then reads the snapshot. This addresses the A5b report's "Not verified" note.
- `reset-calls.ts`: a reset's `claim`, `target` and `explored` calls are routed to the ledger that owns the act, found through the project snapshot's `owner`. A call that names no act goes to the reset brief's own ledger.
- `whole-trials.ts`, `automationStudioProjectBuildWholeTrials`: the judge and `automationStudioCandidateTrialPort`, moved out of `service.ts` and used by `candidate` and `project` alike.
  - Given the project ledger, it records every whole trial's acts under the supervisor: `forBrief("supervisor").trialRan(...)`. **This is A5a's open question 3.**
  - It keeps `prepareStart` on the wrapped port.
- `subflow-trials.ts`: the A4b port over the shared trial environment.
  - Sessions open through `admitAutomationStudioBuildTrialSession`, using the build id, the brief from `metadata.subflowTrial.briefId`, and the lease from `AutomationStudioHostLeaseScope.current()`.
  - The scoped judge is the build-test judge with one synthetic instruction: the brief's parts, word for word, plus the success check.
  - It answers `currentPlanDigest` from the record.
  - It keeps every proposal it tries (`proposals.ts`). These serve the supervisor's `proposals(ref)` and each later trial's `predecessorProposals`, which are the latest proposals of each subflow whose trial answered yes.
- `brief-calls.ts`: the `maxCalls` for a build or repair brief is `maxIterations × 3`: one decision plus at most two judge calls for the trial it may make. A reset brief gets `maxIterations`. **This is the "room for its subflow trials" item**, because A5b's call cap counts judge calls.
  - `allowanceUsd` is the supervisor's own choice. Nothing here resizes it (see Open questions).
- `decisions.ts`: the candidate generator's decide, copied for every agent, with shared accounting (decisions + instruction authority + whole and subflow judges).
- Smaller pieces:
  - `draft-record.ts`: the candidate's draft record shape.
  - `records.ts`: one store per ports object.
  - `promote.ts`: the candidate's promotion unchanged, then the record ends `promoted` or `partial`.
  - `local-host.ts`: a capacity-1 port for domains with none. Its grant names a session that no client has.
  - `supervisor-ledger.ts`, `trial-reads.ts`, `types.ts`, `index.ts`.

**`runtime/service.ts`.** All edits are in place: same line count (4333), with no packed statement added.

- Imports:
  - `automationStudioBuildTestJudge` and `automationStudioCandidateTrialPort` are dropped from their import lines.
  - `AutomationStudioSiteResetProjectLedger` is added.
  - One project-build import line is added. To keep the line count, the long trial-runner comment line was moved into the trailing comment of the `trials` line, and its account into `whole-trials.ts`.
- Mode checks: the candidate-only tests (inventory, original-source inventory, active-instructions-required, incomplete draft, and the branch `if`) are now true for `project` too.
- `:1576`: the project ledger. The build-level siteReset is the supervisor's ledger.
- `:1577-1578`: the gate's input is named `permissionGround` and reused per brief.
- `:1580`: `personAsk` is named.
- `:1586-1589`: the trial environment, then `trials = automationStudioProjectBuildWholeTrials(...)`, then `project = projectLedger ? {...} : undefined`.
- `:1590`: `(project ? runAutomationStudioProjectBuild.bind(undefined, project) : generateAutomationStudioFlowCandidateDraft)({...})`.
- `:1606`: the same ternary between `promoteAutomationStudioProjectBuild` and `promoteAutomationStudioCandidateTrial`.

**Mode plumbing:**

- `service/flow-bootstrap-commands/{generation-request,contracts}.ts`: accept `project`, and refuse `project` with `mode: "extend"`.
- `api/contracts/adaptation.ts`: accepts `"project"`.
- `api/handlers/llm-generation.ts`: `configured` now resolves to Core's configured mode, including `project`. This is **the coordinator's W4 note**. An explicit `project` is also accepted.
- `conversations/commands/build.ts`:
  - The chat authors candidates in any mode except `legacy`.
  - It sends Core's configured mode, so a Core started with `FLUXIQ_AUTHORING_MODE=project` builds create-here and explore in project mode.
  - It sends `candidate` for an extend (improve), because a project extend is refused until A7.
- `flow-bootstrap/action-permissions.ts`: the "unanswered act" line is now said only in legacy, not in `project` either.

**Tests:**

- New `service/project-build/tests/project-build-facade.test.ts` (5 tests): the one-part yes and no; two parts at capacity 2 and at capacity 1; extend refused before any model call.
- New `project-build-ledger.test.ts` (5 tests):
  - a whole trial's acts land under the supervisor in the ledger;
  - nothing is recorded without a ledger, or without a lasting act;
  - `prepareStart` stays on the port;
  - a reset's claims are routed to the act's owner;
  - the call-cap sizing.
- Additions to `generation-request.test.ts`, `llm-generation.test.ts` (configured → project) and `conversations/commands/tests/build.test.ts` (project create, and candidate for an extend).

**Docs:** `docs/architecture/automation-studio/llm-flow-bootstrap.md` gains the mode list entry and a section, "Authoring mode `project`".

**The coordinator's `prepareStart` question.** Yes, a Lab-started project Core's start hook reaches the whole-candidate trial port in project mode:

- `trialEnvironment` carries `prepareStart: this.prepareCandidateStart`.
- `automationStudioCandidateTrialPort` puts `port.prepareStart` on the port.
- `whole-trials.ts` copies it onto the wrapped port.
- The supervisor's `AutomationStudioFlowCandidateTrialGate` calls `prepareStart` before each trial, as the candidate gate does.

This is checked by the ledger test "keeps the deployment's start hook…". Subflow trials also get it, because the same environment is spread into the A4b ports and `run.ts` calls `automationStudioCandidateTrialStart`.

## Commands run and observed results

All commands were run in the worktree, the vitest ones from `packages/fluxiq`.

- `pnpm.cmd --filter fluxiq check`: `check exit 0`, with no `error TS` lines, on the final tree.
  - Earlier runs failed:
    - an import that was still in use (`automationStudioRunEndViewReader` at `service.ts:2500`, now restored);
    - a binding type: the submission's binding is a Pick, so `binding` became its own port;
    - two test casts.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (351 warning(s), 1156 baselined)`. The only warning on new code is `[directory-files] … service/project-build/: 16 source files is past the 15-file advisory threshold`.
  - Earlier failures were fixed:
    - `[imports]`: `../../parking/port.ts` and `../flow-bootstrap-commands/cancellation.ts` now import from their barrels;
    - `[statement-packing]`: a test cleanup arrow.
- `wc -l service.ts`: `4333`.
- `git diff --check`: exit 0. The new untracked files were checked with `git diff --no-index --check /dev/null <file>`, which printed only LF/CRLF notices.
- `pnpm.cmd exec vitest run` on:
  - `service/project-build`, `service/flow-bootstrap-commands/tests`, `service/candidate-trial` and `service/subflow-trial`;
  - `api/handlers/tests/llm-generation.test.ts` and `conversations/commands/tests`;
  - `flow-bootstrap/tests/site-reset-{build,irreversible}.test.ts`;
  - `project-agents`, `model/authoring-mode` and `service/tests/instruction-authority.test.ts`.

  Result: `Test Files 78 passed (78)`, `Tests 625 passed (625)`. That run came before the last two test-only fixes (casts, cleanup lines). After them, `vitest run …/service/project-build` gave `Test Files 2 passed (2)`, `Tests 10 passed (10)`.
- Existing candidate tests are unchanged and pass, including `candidate-trial-facade.test.ts`, inside the 78 files above.

## Not verified

- No live or browser run, and no paid provider: everything ran on the mock provider and the `isolated` evidence runtime.
- The web domain's real `hostResources` port and lease stamping through the client gateway. The tests use a counting stub port.
- Reset briefs run end to end through the service. Only the routing of claims was unit-tested, not `remainingActs` and `beforeTrial` with a real start check.
  - A trial's act has no spot, so the ledger's `target` refuses any lasting undo of it (`undo_wrong_target`) and keeps the act. After `beforeTrial` has asked twice, the reset completes `done` with those acts kept. This is the ledger's existing semantics, and it is the same in candidate mode.
- Builder permission or person-needed endings. The dispatcher sets each builder loop's signal itself, so a per-brief permission request stops only that brief's tool calls, not its loop. The promotion's permission outcome is read from the build-level gate, so it does not include a builder's asks.
- Full suites were not run (as the rules say).

## Open questions or contradictions found

1. **Allowance USD.** `allowanceUsd` is chosen by the supervisor model and must fit `purse.allocatableUsd()`. Only the call cap was given room for trial judges. If judges need more USD headroom, that belongs in the supervisor's guidance or the brief contract (A5a), which this brief does not own.
2. **`service/project-build/` has 16 files**, one over the advisory 15. Two of them could fold into others, at the cost of two exported values in one file: `records.ts` into `run.ts`/`promote.ts`, and `supervisor-ledger.ts`. They were left separate because of the one-export-per-file rule.
3. **The chat's improve in a project Core sends `candidate`.** The brief says to refuse `project` with `extend`. The chat therefore falls back to a candidate build for an extend rather than failing every improve. If the user wants improve refused instead, it is one line in `conversations/commands/build.ts`.
4. **The reserve covers one judged whole run only** (2 judge calls). The plan says "the judged whole run and one repair round". The repair-round share is not kept back.
5. **Build records are not persisted with the ledger snapshot.** The project ledger has no `persist` port wired: the record's `lastingActs` are not written from it. A5b/A4b left this optional.
6. **The supervisor is not exported from the runtime barrel.** No caller outside Core needs it yet: W4 drives the mode through `FLUXIQ_AUTHORING_MODE` and the request.
