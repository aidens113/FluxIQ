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

**Progress measure:** implementation lines under `programs/automation-studio`, counted by the structure audit. 120,705 on dev at the start; expected near 4,000 at the end.

**Lanes**

| Lane | Task | Owner | State |
| --- | --- | --- | --- |
| Backend moves and controller | t845 | Lead | Tool built and tested; dry run clean; first move next |
| Chat package and second client | t846 | Sub-supervisor | Dispatched |
| Web semantics downstream | t847 | Worker | Dispatched |

**Next steps**

1. Rename the neutral contract subpath and narrow the five type imports that reach Studio's API barrel.
2. Run the full move in one commit, verify it, then typecheck, audit and test.
3. Remove the forwarding files; move the storage helpers moved code still takes from `programs/_shared`.
4. Add the Studio gate to the structure audit; retarget `fluxiq/automation-studio` consumers; thin the handlers.
5. Integrate t847, then t846, then the t841 work; run the full suites; promote.

**Blockers:** none.

## Why The Plan Changed

Measured on 2026-11-02 against `dev` (Core `ff8eb0be8`, downstream `d6e5448c`):

| Measure | dev | t843 |
| --- | ---: | ---: |
| Implementation lines under Studio | 120,705 | 111,870 |
| Non-test files outside the admission system importing it | 0 | 242 |
| Paths changed against dev | n/a | 3,025 |
| `project-build-trial-reset` "runs each trial on the site" | passes, 2.5 s of test time | times out at 300 s |

t843 moved 7% of the logic. Most of its change is an execution-admission and observation system with guards threaded through the code being moved. The goals do not include that system, and no standing rule or user-attributed line in the record asks for it; it began as a report on granting another live trial.

Limit on the test comparison: t843 edited that test file by 347 lines, so these are not the identical test. Running dev's copy on t843 failed at load because a helper it imports had moved. The comparison shows the composed build works on dev; it does not isolate which t843 change stalls it. That no longer matters to this plan, because the moves start from dev and cannot change behaviour.

## How The Moves Work

`scripts/refactor/move-owners.mjs` moves whole trees with their tests. It rewrites relative imports, `vi.mock` and related calls, `new URL(.., import.meta.url)` reads, named paths in configs and baselines, and paths in comments and prose. It never touches stored data paths (`.fluxiq/data/programs/...`) or panel routes (`/api/programs/...`), refuses to overwrite a file, and refuses to run if any file's tokens would change beyond its paths.

`--verify <ref>` re-reads both sides from git and proves the same thing independently of the code that made the edits. Studio has no location-dependent production code and no computed imports, which is what makes a path-only move safe.

The moves run as one commit rather than one per folder. The structure audit bans `runtime/` from importing Studio, and Studio's folders depend on each other, so moving them one at a time would fail the audit at every step and block every backup push.

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

## Open Questions

None requiring the user. Whether to pick the admission work back up later is the user's call and does not affect this plan.
