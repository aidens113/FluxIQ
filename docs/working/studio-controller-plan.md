# Automation Studio As A Controller Of Core

Status: Active
Status detail: Replaces the t843 reset plan. Backend moves restart from dev with a path-only tool on t845; chat package on t846 and web boundary on t847 run in parallel.
Created: 2026-11-02
Last updated: 2026-11-02
Owner: Senior supervisor
Scope: Move backend logic out of programs/automation-studio, leave Studio as a thin controller of Core, and put the extension's chat UI in its own reusable package.
Paired document: ../!FluxIQWebExtension/docs/working/studio-controller-plan.md
Related: [code structure](../architecture/code-structure.md), [runtime ownership](../architecture/runtime-ownership.md)

## Current State

**The goals, in the user's words (2026-11-02):** "move logic of runtime and most other stuff out of the programs/automation-studio where it didnt belong, make programs/automation-studio just a controller of core, and put the UI from the extension into its own package so otehr clients can use it and we can update that chat UI centrally".

**Done means:** nothing outside Studio imports Studio, tests included; Studio holds only endpoint registration and thin handlers, view state, metadata and its entry; the extension and a second real client both render chat from one package; both `dev` branches and `main` carry it after the full suites pass.

**Progress measure:** implementation lines under `programs/automation-studio`. 120,705 on dev at the start; 3,504 after the move, all in `api/` and `metadata.ts`.

**Lanes**

| Lane | Task | Owner | State |
| --- | --- | --- | --- |
| Backend moves and controller | t845 | Lead | Move committed locally and verified; first full suite running; audit findings next |
| Chat package and second client | t846 | Sub-supervisor | Running |
| Web semantics downstream | t847 | Worker | Running |

**Next steps**

1. Read the first full suite, then fix the failures the move caused and record the rest.
2. Retire about 400 forwarding files and create the 30 prefix directories. Fix the 29 import findings, adopt the new rule's baseline and push.
3. Move the logic out of the ten flagged functions, listed below.
4. Move the storage helpers moved code still takes from `programs/_shared` and `database-manager`. Retarget about 1,500 `fluxiq/automation-studio` imports.
5. Fix the failures dev already has, listed below.
6. Integrate t847, then t846, then finish t841. Update authored architecture documents and remove `scripts/refactor`. Run the full suites, then promote.

**Blockers:** none. Core's t845 commits are local because the pre-push audit refuses them until step 2; the downstream branch is pushed.

**Failures dev already has.** These fail on plain `dev` at `ff8eb0be8` as well as on t845, so the move did not cause them, and they block promotion. Paths are the new ones under `packages/fluxiq/src`.

| File | Failing tests | Observed |
| --- | ---: | --- |
| `framework/automation-service/service/candidate-trial/tests/consequences.test.ts` | 5 | `expected { inputs: {}, …(7) } to be { inputs: {}, …(6) }` |
| `runtime/flow-authoring/bootstrap/candidate/tests/trial-gate.test.ts` | 3 | Output contains `llm_evidence_loop.repeat_refused` |
| `framework/automation-service/service/candidate-trial/tests/environment/tests/trial-environment.test.ts` | 1 | `expected { …(4) } to be { …(3) }` |
| `framework/automation-service/service/subflow-trial/tests/environment.test.ts` | 1 | `expected { …(4) } to be { …(3) }` |
| `framework/automation-service/service/end-view/tests/passive-result.test.ts` | 1 | `expected [Function bound spy] to be [Function spy]` |
| `runtime/adaptation/recovery/tests/runtime-exploration-views.test.ts` | 1 | Not yet read |
| `runtime/agents/llm/harness/tests/run-size.test.ts` | 1 | `expected 'attempted' to be 'not_attempted'` |
| `runtime/result-verification/build-test/tests/task-checklist.test.ts` | 1 | Request bytes differ |

**Failures the move caused so far.** `components/automation/tests/ownership.test.ts` timed out at 15 s during the parallel run; not yet known whether that is load. The two browser-safe subpath `client/tests/index.test.ts` files and `explored-evidence-label.test.ts` hard-code relative paths to files that moved.

**Functions still holding logic,** flagged by the new rule, all under `programs/automation-studio/api/handlers/`:

| File | Function | Lines |
| --- | --- | ---: |
| `llm-generation.ts` | endpoint handler | 102 |
| `runtime-execution.ts` | endpoint handler | 91 |
| `llm-generation.ts` | `sanitizedFlowBootstrapGeneration` | 42 |
| `conversations.ts` | endpoint handler | 34 |
| `instructions.ts` | endpoint handler | 33 |
| `flows.ts` | endpoint handler | 29 |
| `llm-execution-settings.ts` | `assertFlowLlmExecutionSettings` | 28 |
| `conversations.ts` | endpoint handler | 22 |
| `conversations.ts` | endpoint handler | 21 |
| `conversations.ts` | `commandContext` | 21 |

The other 166 endpoints are already thin: a permission, a resource and a call to the service.

## Why The Plan Changed

Measured on 2026-11-02 against `dev` (Core `ff8eb0be8`, downstream `d6e5448c`):

| Measure | dev | t843 |
| --- | ---: | ---: |
| Implementation lines under Studio | 120,705 | 111,870 |
| Non-test files outside the admission system importing it | 0 | 242 |
| Paths changed against dev | n/a | 3,025 |
| `project-build-trial-reset` "runs each trial on the site" | passes, 2.5 s of test time | times out at 300 s |

t843 moved 7% of the logic. Most of its change is an execution-admission and observation system with guards threaded through the code being moved: a database ledger recording that each step was allowed to run and proof that it ran. The goals do not include that system, and no standing rule or user-attributed line in the record asks for it; it began as a report on granting another live trial. Asked about it on 2026-11-02, the user did not know what it was. It stays unmerged on t843; do not bring it back as part of this work.

Limit on the test comparison: t843 edited that test file by 347 lines, so these are not the identical test. Running dev's copy on t843 failed at load because a helper it imports had moved. The comparison shows the composed build works on dev; it does not isolate which t843 change stalls it. That no longer matters to this plan, because the moves start from dev and cannot change behaviour.

## How The Moves Work

`scripts/refactor/move-owners.mjs` moves whole trees with their tests. It rewrites relative imports, `vi.mock` and related calls, `new URL(.., import.meta.url)` reads, named paths in configs and baselines, and paths in comments and prose. It never touches stored data paths (`.fluxiq/data/programs/...`) or panel routes (`/api/programs/...`), refuses to overwrite a file, and refuses to run if any file's tokens would change beyond its paths.

`--verify <ref>` re-reads both sides from git and proves the same thing independently of the code that made the edits. Studio has no location-dependent production code and no computed imports, which is what makes a path-only move safe.

The moves run as one commit rather than one per folder. The structure audit bans `runtime/` from importing Studio, and Studio's folders depend on each other, so moving them one at a time would fail the audit at every step and block every backup push.

`scripts/refactor/retire-forwarding.mjs` deletes modules that only forward to one other module, pointing importers at the real one. `scripts/refactor/prefix-directories.mjs` applies the audit's rule that a shared filename prefix becomes a directory, for the groups the audit newly reports. Those groups were exempt only because their old paths were too deep to take another directory. All three tools are temporary and are removed when this work finishes.

## How It Stays Done

- `scripts/structure-audit/rules/program-controllers.mjs` fails the build if a source file appears in Studio outside `api/`, `ui/`, `index.ts` and `metadata.ts`, and ratchets any function there over 20 lines. The budget is per function because a file of thirty endpoints is long and still thin. The 20-line figure is a supervisor choice from the measured distribution, not a user rule: 131 of 176 handlers are 10 lines or fewer.
- `importBoundaries` in the audit config stops every framework area importing Studio, tests included. Only the program catalog composes it.

## Destinations

Paths are relative to `packages/fluxiq/src`. Sources are under `programs/automation-studio/`.

| From | To |
| --- | --- |
| `runtime/flow-bootstrap`, `flow-draft`, `flow-version`, `authored-metadata`, `domain-build-state`, `candidate-start-hook` | `runtime/flow-authoring/*` |
| `runtime/service`, `service.ts`, other root runtime composition, `nodes`, `testing`, `learning`, `mining` | `framework/automation-service/*` |
| `runtime/llm`, `loop-limits`, `provider-refusal` | `runtime/agents/*` |
| `storage`, `api/ownership` | `framework/persistence/automation/*` |
| `api/contracts`, `types.ts` | `api-contracts/automation/*` |
| `runtime/result-verification` | `runtime/result-verification` |
| `runtime/result-check-*` | `runtime/result-control/check-*` |
| `runtime/recovery`, `flow-change`, `live-patch`, `adaptation-confidence`, `durable-behavior`, `exploration-reduction`, training and orchestrator files | `runtime/adaptation/*` |
| `runtime/project-agents` | `runtime/project-agents` |
| `runtime/conversations`, `activity`, `parking`, `action-permissions` | `runtime/interaction/conversations`, `runtime/{activity,parking,action-permissions}/automation` |
| `runtime/gateway-trace`, `client-gateway`, `normalization`, recording and policy models | `runtime/recording/*` |
| `model`, `dsl` | `flows/authoring/*` |
| `fingerprinting` | `runtime/target-matching/fingerprinting` |

Stays in Studio: `metadata.ts`, `index.ts`, `ui/`, `api/handlers`, `api/handlers.ts`, `api/index.ts`, and the tests that exercise those handlers.

## What Happens To t843 And The Other Branches

Audited on 2026-11-02 at the user's request; every ref in both repositories with a commit since 2026-10-29 was checked, merged or not, along with stashes and every registered worktree's uncommitted files.

| Item | State | Disposition |
| --- | --- | --- |
| t817 to t840, t842 | Merged into dev | Kept, because this work starts from dev |
| `task/t843-runtime-foundations` | Unmerged, pushed in both repositories | Parked as the record of t843; not deleted |
| t843 target and recording work | On that branch | Ported by the t847 lane |
| t843 push-gate cache change, `bfd3ee47e` | On that branch | Port to this unit |
| t843 SQL cleanup error corrections | On that branch | Port as a named fix after the moves |
| t843 audit boundary rules | On that branch | Replaced by the Studio gate here |
| Execution admission, observation and guards | On that branch | Not ported; not part of these goals |
| `task/t841-runtime-verification-evidence` | 19 uncommitted files, found by this audit | Saved and pushed as WIP in both repositories; finish after the moves |
| `task/t844-runtime-boundary-baseline` | Clean, at the pre-t842 commits | Nothing to keep |
| t842 Core worktree | Clean, detached at its merged head | Nothing to keep |

Older parked work from before this refactor was left alone: unmerged branches t707, t518, t381, t337, t335, t334, the `wip/*` snapshots and others, plus uncommitted files in worktrees t532, t782, t262, t418, t524, t526, t721, t733-validate and three sweep folders. None of it is part of this unit.

## Work Ledger

### 2026-11-02 - Measured the old plan, audited branches and built the move tool

- Agent: lead, with one worker for the t843 push gate.
- Changed: `scripts/refactor/move-owners.mjs` and its tests; this plan. t843 checkpointed and pushed with its reset plan marked superseded. t841's uncommitted work saved and pushed.
- Validation: `node --test scripts/refactor/tests/move-owners.test.mjs` -> 11 passed, 0 failed.
- Validation: `node scripts/refactor/move-owners.mjs <manifest> --dry-run` -> 4,362 files to move, 5,678 imports to rewrite, 0 problems. After narrowing, only tests and two files still tie moved code to Studio.
- Validation: on `dev`, `vitest run .../project-build-trial-reset.test.ts -t "runs each trial on the site"` -> 1 passed, 50.09 s, 2,475 ms of test time. On t843 the same selector -> 1 failed, "Test timed out in 300000ms", 359.93 s.
- Validation: on t843, `pnpm --filter fluxiq check` -> 1 error, in `step-loop/tests/incident-repair-properties.test.ts`, left as found. `implicit-clocks` has one failing case, which also fails without the push-gate edits.
- Outcome: plan replaced. No paid run, panel or browser started.

### 2026-11-02 - Moved the Studio backend in one verified commit

- Agent: lead.
- Changed: `756a98917` moves 4,363 files with the manifest in `studio-controller-plan/moves/01-studio-backend.json` and renames the contract to `@fluxiq/contracts/automation`. Downstream `916cd990` and `a8e89863` follow. `e7dd34617` adds the `program-controllers` rule, import boundaries and the two further tools.
- Validation: `node scripts/refactor/move-owners.mjs <manifest>` -> 43 s, 4,363 moved, 5,701 imports rewritten, 0 problems. `--verify` -> 4,464 files compared; the only differences are two contract-rename strings and the tool's own later edits.
- Validation: `pnpm --filter fluxiq check` -> 0 errors, 2 m 5 s. `node scripts/structure-audit.mjs` -> 60 findings: 30 prefix groups, 29 imports, 1 directory size. All path shape; none in logic.
- Validation: `node --test` on the tool and rule tests -> 21 and 8 passed at their last runs.
- Validation: first full suite (`pnpm -r --no-bail test`) started 22:20; 12 failing files at 1,500 passing. Running those files on `dev` shows 8 fail there too, with 14 failing tests.
- Correction: a first file-length budget of 150 lines was replaced after measuring that the long files are registration tables. An earlier commit that captured only the contract's file rename was redone, unpushed, as part of `756a98917`.
- Outcome: move holds at compile and token level; full suite result pending. No paid run, panel or browser started.

## Open Questions

None requiring the user.
