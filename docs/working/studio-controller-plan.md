# Automation Studio As A Controller Of Core

Status: Complete
Status detail: Delivered on dev and main in both repositories on 2026-11-03. Replaced the t843 reset plan. Items left out on purpose are listed in Current State.
Created: 2026-11-02
Last updated: 2026-11-03
Owner: Senior supervisor
Scope: Move backend logic out of programs/automation-studio, leave Studio as a thin controller of Core, and put the extension's chat UI in its own reusable package.
Paired document: ../!FluxIQWebExtension/docs/working/studio-controller-plan.md
Related: [code structure](../architecture/code-structure.md), [runtime ownership](../architecture/runtime-ownership.md)

## Current State

**The goals, in the user's words (2026-11-02):** "move logic of runtime and most other stuff out of the programs/automation-studio where it didnt belong, make programs/automation-studio just a controller of core, and put the UI from the extension into its own package so otehr clients can use it and we can update that chat UI centrally".

**Done.** Core `main` and `dev` carry it at `1ae3240d3`, the extension's at `186c028b`.

- **Studio is a controller.** Implementation lines under `programs/automation-studio` went from 120,705 to 2,928, across 30 files, with no function over 20 lines. It holds only `api`, `ui`, `index.ts` and `metadata.ts`.
- **It stays that way.** The audit's `program-controllers` rule and import boundaries fail the build if logic or an import comes back.
- **The runtime has its own public entry:** `fluxiq/automation` and `@fluxiq/contracts/automation`. `fluxiq/automation-studio/dsl` keeps its name because saved Flow source contains that import. `fluxiq` is 0.27.0, `@fluxiq/contracts` 0.7.0, and `docs/architecture/package-boundaries.md` has the migration note.
- **Chat is one package.** `@fluxiq/ui-components` renders the extension's chat and Core's panel route `/programs/automation-studio/chat`.
- **Validated.** Full sweep: Core 21,940 tests passed, extension repository 9,954 passed, checks and builds passing. Live from the extension chat: both tasks passed, $6.31 across all the runs. The ledger has each one.

**Left out of this unit on purpose, for the user to decide:**

- **Five small browser-field readers remain in Core:** `recording-steps.ts`, `activity/wording/action.ts`, `evidence/state-elements.ts`, `rerun-check.ts`, `locator-text.ts`. They read fields of stored targets for wording and screening. Moving them needs a design per reader.
- **Framework code still imports `programs/_shared/storage.ts` and `database-manager`.** These are shared helpers rather than Studio, so the goals do not reach them.
- **The step log's page reader is a process-wide registry.** It only writes the diagnostic `page.txt`, and replacing it means threading an option through the evidence loop.
- **Core's panel has two chat UIs,** its own and the shared widget at `/programs/automation-studio/chat`, which nothing links to yet. Replacing its own needs six port additions; see `reports/chat-package.md`.
- **t841** is saved and pushed, unmerged: an unfinished fix for correct results being held as unsure.
- **Other `retry_allowed` refusals** may have the same gap the re-test fix closed; see `reports/dev-failures.md`.
- **A repaired run's rows came out neither deduped nor sorted.** In `run-mw0jw263-0251c104` the 3 rows of the failed attempt stayed in front of the 10 of the repaired read, duplicates included, though `processEndedRunDatasets` is called after a repair. Why is not established: either the rows were not reprocessed or their stored keys differ. The run was honestly reported as failed, and it needs a failure and a repair to appear.
- **A ceiling above $5 without the flag is refused for chat-started builds.** That is an agent's reading from t843, not a user rule.

**Not exercised:** no Firefox run. No real-browser test of the panel's chat route. A call stopped by a person-only check while exploring is proven by tests only: `run-mw0l0e9y-a7d8ae51` met its checks in test steps and playback, which carry no draft.

**Branches.** t845, t846 and t847 are closed locally; their remote branches remain, because deleting one needs the user's approval. t843 stays parked and unmerged: see "What Happens To t843 And The Other Branches".

**Blockers:** none.

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

`--verify <ref>` re-reads both sides from git and proves the same thing independently of the code that made the edits. Studio has no computed imports and no production code that loads files by location. One function did depend on location, which an earlier version of this plan missed: `flowBootstrapThrownIssueCodes` read stack frames under `automation-studio/`. The first full suite caught it through `accounting.test.ts`. It now reads frames under Core's source and reports the same frames by their new paths, and a search of moved production code found no other reader. So "cannot change behaviour" holds for the move itself, while code that inspects paths has to be looked for separately.

The moves run as one commit rather than one per folder. The structure audit bans `runtime/` from importing Studio, and Studio's folders depend on each other, so moving them one at a time would fail the audit at every step and block every backup push.

`scripts/refactor/retire-forwarding.mjs` deletes modules that only forward to one other module, pointing importers at the real one. `scripts/refactor/prefix-directories.mjs` applies the audit's rule that a shared filename prefix becomes a directory, for the groups the audit newly reports. Those groups were exempt only because their old paths were too deep to take another directory. All three were temporary and are gone from the tree; their manifests stay in `studio-controller-plan/moves/`.

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

### 2026-11-02 - First full suite, follow-up moves and audit passing

- Agent: lead; `chat-package` sub-supervisor with four workers.
- Changed: `debb7cb84` moves `llm`, conversations and other trees out of small neutral layers. `525b4ae4f` retires 400 forwarding modules. `92d815df2` creates 25 prefix directories. `5449a7768` settles small owners and adopts the `program-controllers` baseline. The diagnostic issue code cap rises from 100 to 160 characters, because ten deep modules would otherwise have lost their code.
- Validation: `pnpm -r --no-bail test` at `814b036ce`, one of today's two full runs -> contracts 562 passed; gateway 182 passed; fluxiq 15,542 passed and 34 failed, then real-sql 1,677 passed and 21 failed; apps/web 3,453 passed and 1 failed. 42 m 21 s.
- Validation: the failing files on `dev` at `ff8eb0be8` -> 9 files and 15 tests fail there too; `accounting`, `settings-round-trip` and the ownership and path tests pass there, so those came from the move.
- Validation: `node scripts/structure-audit.mjs` -> passed (478 warnings, 1,112 baselined). `pnpm --filter fluxiq check` -> 0 errors. `vitest run src/programs/automation-studio/api/tests` -> 82 passed. `git push` through the pre-push audit -> accepted.
- Validation, chat lane, re-run by the lead: `vitest run` in `packages/ui-components` -> 65 files, 408 passed. `node scripts/test-extension.mjs panel/` from `apps/extension` -> 584 passed, 0 failed. Audit passes in both t846 worktrees; `core-mirror` matches. The lane's report is `studio-controller-plan/reports/chat-package.md` on t846.
- Correction: the web-vocabulary rule listed its packages by hand after the chat lane's change, so a new package would have escaped it. It now covers every package except `ui-components`.
- Outcome: no browser, paid run or panel started. One full run remains in today's allowance.

### 2026-11-03 - Lanes merged, public entry renamed, final validation

- Agent: lead; workers `thin-handlers`, `dev-failures`, `sql-cleanup-errors`, `architecture-docs`.
- Changed: the fixes above. `fluxiq/automation` is the public automation entry, and `fluxiq/automation-studio` only the controller. `fluxiq/automation-studio/dsl` keeps its name because saved Flow source contains that import. `model-text` scanned a folder that no longer existed; it now reads the new locations and fails if they go missing.
- Validation: `pnpm -r --no-bail test` at `6ad28e036` -> contracts 562 passed; gateway 182 passed; fluxiq 15,578 passed and 4 failed, then real-sql 1,709 passed; ui-components 408 passed; apps/web 3,495 passed. The 4 were tests naming the old subpaths: fixed, and those files -> 12 passed.
- Validation: Core `pnpm check` -> exit 0. Core `pnpm build` -> first failed in `web:build`, then passed at `63f0780b7` with the chat route listed. Extension `pnpm check` -> 738 passed and 1 failed: a stale literal check that also fails on dev; fixed in `71dd2b09`.
- Validation: `model-text` -> 426 files scanned, no findings. Audit passes in both repositories.
- Live: first launch refused before starting, cost $0, because `--llm-max-cost-usd 2` cannot reach a chat-started build. Second, `run-mw0gxo08-241fb3e7`: cost $0, failed in the web build; see its debug note. Third refused by the Lab's `loop` and `debug` guards, cost $0.
- Outcome: awaiting the extension suite and the live rerun.

### 2026-11-03 - Live tests, and three defects they found on dev

- Agent: lead.
- Live, all Claude Sonnet 5.5 from the extension chat: `run-mw0hzrhs-344f6976` $1.0621 and `run-mw0irrs5-cb525a15` $1.0767 failed on a blank-tab capture (t842's defect, fixed). `everything-store-kettle-to-cart`, `run-mw0jgf2o-478d13da`, $1.1600 -> passed: 13 of 13 steps, 2 of 2 rows. `crossborder-marketplace-free-hubs-under-ten`, `run-mw0jw263-0251c104`, $1.8942 -> failed: see its debug note. The same task after the fixes, `run-mw0l0e9y-a7d8ae51`, $1.1163 -> passed: 10 of 10 rows in order, 40 of 40 fields, all 3 pages, 0 repairs. Total $6.31.
- Changed: none of the three defects came from the moves; the files match `dev` apart from imports. A call a person-only check stopped now stands as having acted when its draft says it went out (`person-needed-tool-calls.ts`), which started that run's failure. A condition named by a read the screen took apart is matched to no column (`condition-authored.ts`). The extension's Next fallback uses the shared current-page rule (`detect-pagination.ts`, downstream).
- Changed: `fluxiq` 0.27.0, `@fluxiq/contracts` 0.7.0 and `@fluxiq/client-gateway-websocket` 0.1.1, with a migration note in `docs/architecture/package-boundaries.md`.
- Validation: each fix's test was seen to fail first. `vitest run` over `person-needed.test.ts`, `computed-facts`, `located-defects` and the two other person-needed suites -> 135 passed. `node scripts/test-extension.mjs detect-pagination pagination` -> 51 passed, 0 failed. Core `pnpm --filter fluxiq check` -> exit 0. Audit passes in both repositories.
- Validation: `crossborder-next-page` specs, headed Chromium on the realistic marketplace -> 2 passed. The new spec without the fix -> failed with `ended: control_absent`, the run's own error. Moved to `list-states/tests/crossborder-pinned-next-page.spec.ts` for the folder's file limit and rerun there -> 1 passed.
- Outcome: live tests pass. The final sweep follows.

### 2026-11-03 - Final full sweep

- Agent: lead.
- Scope: Core `2674c655d` and extension `8c8fdcc3`, with nothing heavy alongside.
- Validation: Core `pnpm -r --no-bail test` -> exit 0: contracts 562, gateway 182, fluxiq 15,584 (6 skipped), real-sql 1,709 (1 skipped), ui-components 408, web 3,495; 21,940 passed. `pnpm check` -> exit 0. `pnpm build` -> exit 0.
- Validation: Extension `pnpm test` -> exit 0: domain 2,900, extension 3,211, scenario-lab 1,015, test-runner 2,539, test-contracts 176, the rest 113; 9,954 passed, 0 failed. `pnpm build` -> exit 0.
- Validation: Extension `pnpm check` -> exit 1: the new spec read `validation.actual`, which not every variant of that type has. Playwright does not typecheck, and the earlier typecheck predated the spec. Fixed to `nextPage.outcome` and rerun -> exit 0, 739 passed; the spec, headed -> 1 passed.
- The two scenario tests that failed beside a concurrent production build pass here, alone with the suite: load was the cause.
- Outcome: the tree is ready to merge. It differs from the swept commits only by that spec line and this ledger.

### 2026-11-03 - Merged to dev and promoted to main

- Agent: lead.
- Changed: both task branches merged into `dev`, and `main` fast-forwarded in both repositories. t846 and t847 closed.
- Validation: `pnpm task finish t845`, extension -> `Merge task t845`, audit passed, `186c028b`. Core -> contract tests 70 passed, `pnpm check` passed, `1ae3240d3`. The merged trees differ from the swept commits only by this document and its index in Core, and by the one spec line in the extension repository.
- Validation: `git push origin 1ae3240d3:main` -> `bcbcfa971..1ae3240d3`. `git push origin 186c028b:main` -> `ee5768d5..186c028b`. Both fast-forwards.
- Validation: `pnpm task abandon t846` and `t847` -> exit 0, 0 unmerged commits on either side.
- Notes: Core's finish failed twice before it passed, and no gate was skipped. The first run loaded `dev`'s tool, whose contract list held the pre-move paths; the checkout had moved to the task branch, so the rerun used the new list. The second failed because the main checkout had no install for `packages/ui-components`: `pnpm install --frozen-lockfile` fixed it. An amend of an unpushed commit was refused by the permission system, so that fix is its own commit.
- Outcome: delivered. Items left out on purpose are in Current State.

## Open Questions

None requiring the user.
