# t533-a1-contracts: worker report

## Outcome

Done. Unit A1 (the contracts and the build record, with no wiring) is in
`packages/fluxiq/src/programs/automation-studio/runtime/project-agents/` in the
worktree `fxwork/t533/!FluxIQ`. Nothing is committed.

## What changed and why

The new directory `runtime/project-agents/` holds a barrel `index.ts`. It is
**not** re-exported from `runtime/index.ts`, because that file is outside what
this brief lets me edit. A5 publishes it.

`contracts/` (one exported thing per file, with a barrel):
- `json-shape.ts`: the one reader every parser uses. It accepts only plain objects and own data properties. It refuses unknown keys, accessors, symbols, cycles and non-finite numbers. It answers `{status:"invalid", code, path}` at the first refusal. `storageId` limits ids that become file names (buildId, briefId) to `^[a-z0-9][a-z0-9._-]{0,99}$`, which `safeSegment` leaves unchanged.
- `digest.ts`: SHA-256 over canonical JSON with a version tag for each contract kind.
- `role.ts`: `supervisor | builder | repair`.
- `instruction-source.ts`: `{sourceId, text}`, plus a function that builds the sources from the active `AutomationStudioFlowInstruction`s only.
- `receipt-ref.ts`: `{kind: subflow_trial|candidate_trial, receiptId, digest}`. Receipts stay with their owner.
- `task-spec.ts`: parts carry a verbatim quote `{sourceId, text}`, goal facts and lasting acts. Lasting acts must belong to `AUTOMATION_STUDIO_ACTION_CONSEQUENCES`, the permission gate's vocabulary. The spec also carries `notAsked` and a digest. The parser refuses a digest that is not the digest of the content. `quoteIssues` requires each quote to be an exact substring of a source that the quote names.
- `structure-plan.ts`: `{taskSpecDigest, plan: AutomationStudioFlowBootstrapPlan, partOf: {subflowKey: partIds[]}, digest}`. The parser checks the structure itself:
  - every body is empty;
  - subflow keys are unique;
  - Router rules and the fallback name declared subflows;
  - each subflow has a non-empty `fluxiq.successCheck`;
  - interfaces are well-formed;
  - `partOf` lists exactly the subflows.

  `issues()` checks three more things:
  - the plan is bound to the task spec digest;
  - every part is covered;
  - no part id is unknown.

  It also runs the router's own `automationStudioFlowBootstrapRouteIssues`.
- `subflow-interface.ts`: the interface and port reader, shared by the plan and the brief.
- `subflow-brief.ts`: the contract's fields. `interface` is optional, because a router-run subflow's interface is the Flow's. `issues()` refuses a brief when any of these holds:
  - its plan digest is stale;
  - its subflow is unknown;
  - it names parts its subflow does not carry;
  - its interface differs from the plan's;
  - a predecessor is itself or unknown;
  - `permittedActs` are not asked for by the brief's own parts.

  A repair needs `failingReceipt`, and no other kind may carry one.
- `builder-return.ts`: the contract's fields. `issues()` checks that:
  - the briefId matches;
  - the proposal is for the brief's subflow;
  - a survey has no proposal;
  - only a survey has findings;
  - `done` has a proposal (build or repair) or findings (survey).
- `decision-log-entry.ts`: `{kind: dispatch|triage|re_plan|ending, reason, briefIds, planDigest?}`.

`record/`:
- `build-record.ts`: the types. The main record holds:
  - build id, instruction digest and source ids;
  - task spec and plan revisions;
  - briefs;
  - receipts;
  - the allowance ledger;
  - the project lasting-act ledger, one writer with entries by brief;
  - the decision log;
  - the ending.

  The file also defines the return file, the view and the summary.
- `documents.ts`: places each document at `<flowDirectory>/project-builds/<buildId>/build.json` and `.../returns/<briefId>.json`, using `ProgramJsonStore`. A service with no storage root keeps them in memory. Changes to one document are serialized by a promise chain per document, on top of the store's own file lock. Different documents never wait on each other.
- `build-record-parser.ts`: when a record is reopened, every piece is re-validated: digests, plan-to-task-spec binding, brief-to-plan binding and issues, each return against its brief, and lasting acts against `permittedActs`. An edited file is refused.
- `store.ts`, `AutomationStudioProjectBuildRecordStore`. Its methods are create, read (reopen), summary, recordTaskSpec, recordPlan, recordBrief, recordReturn, recordReceipt, recordAllowance, recordLastingAct, recordDecision and end. Each one persists before it returns. Plans bind to the latest task spec, and briefs to the latest plan. A return file is written once. After `end`, the main file refuses writes, but returns still land because their spend really happened.
- `refusal.ts`: `AutomationStudioProjectRecordRefusal {code, path}`.

Tests:
- `contracts/tests/` has six files.
- `record/tests/store.test.ts` runs the on-disk cases against both the file layout and the SQLite layout. The remaining cases run without a storage root.
- The shared fixture is `project-agents/tests/fixtures.ts`, a recipe-site task that resembles none of the Lab scenarios.

**Supervisor note on plan validation (A4 discovery):** I do not use `parseAutomationStudioFlowBootstrapPlan` or `checkAutomationStudioFlowBootstrapCompletion`, because both refuse empty bodies. Structural validation is my own, as listed above. I do call the pure `automationStudioFlowBootstrapRouteIssues` for router-level checks: a missing condition, a shadowed route, and a subflow that no route or fallback reaches. It exempts subflows that have an `interface` or `role: "recovery"`, since steps no builder has written yet will reach them. Reachability against real bodies is A5's job at assembly.

## Commands run and observed results

All were run from the worktree.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents` (in `packages/fluxiq`). The first run failed one test: a non-empty body gave `project.too_many` instead of `project.plan_body_not_empty`. I fixed the parser. The rerun printed "Test Files 7 passed (7), Tests 64 passed (64)".
- `pnpm.cmd --filter fluxiq check` printed tsc success through the build cache ("inputs changed: packages/fluxiq; stored"), with no errors.
- `node scripts/structure-audit.mjs` printed "structure-audit: passed (345 warning(s), 1156 baselined)". None of the findings concern `project-agents`.
- `git diff --check`: the files are untracked, so I ran `git diff --no-index --check /dev/null <file>` on each new file. It reported no whitespace errors, only LF→CRLF notices. One earlier command that used `git add -N`/`git reset` was blocked by the hook and did not run. The index is unchanged, and `git status` shows only `?? .../project-agents/`.

## Not verified

- Wiring into `service.ts`, the runtime barrel, or any real build (A5).
- Cross-process concurrency on one main file. In-process serialization is tested. Different processes rely on `ProgramJsonStore`'s lock, which the supervisor's single-writer design does not need.
- Registry-level plan validation (`validateAutomationStudioFlowBootstrapPlan`) is not run on structure plans, because it needs a registry.

## Open questions or contradictions found

1. "Verbatim span" is implemented as an exact substring. Models often change case or whitespace, so A5 may want to fall back to `automationStudioComparableInstructionText`. I kept it strict, as the contract says.
2. The contract makes the brief's `interface` required. I made it optional, but it must equal the plan's interface, including when both are absent, because router-run subflows declare none.
3. The builder return has no `planDigest`. It is bound to the plan through its brief, which carries one. A return from a brief on an older plan is still recorded, and the summary marks that brief `current: false`.
4. Ending outcomes (`promoted | partial | blocked | cancelled`) and the allowance ledger's shape (`role, briefId?, usd`) are my choices. A2 may reshape the allowance part.
