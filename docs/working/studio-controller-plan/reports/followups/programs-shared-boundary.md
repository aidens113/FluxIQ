# programs/_shared boundary (t853)

## Outcome

Done (second pass closed the residual edges). The `_shared` storage, state, performance-metrics and database-manager repository code
that framework imported now lives in `framework/persistence`, and the audit fails the build if
`framework`, `runtime`, `flows` or `core` import the cleaned parts of `programs/` again. Four
residual edges remain because removing them needs code changes the brief did not allow
(section "Not done, and why"). Nothing is committed.

## Re-measured (Core, `packages/fluxiq/src`, import lines into `programs/`, outside `programs/`)

Before: `_shared/storage.ts` 59 (framework 55, runtime 4), `database-manager` 20 (framework 16,
platform 4; the earlier note is right: framework imported it through programs, it lives at
`programs/database-manager/storage/sqlite-repository.ts`, 15 files import that file),
`_shared/performance-metrics.ts` 3, `_shared/iam` 2, `identity-access` 10 (framework 4, platform 5,
runtime 1), `secret-keys` 6 (framework 3, runtime 3), `_shared/runtime.ts` 2 (platform tests),
`_shared/api.ts` 2, `_shared/types.ts` 1, `_shared/state-root.ts` 1, `programs/index.ts` 2
(framework/index.ts, src/index.ts). `flows` and `core` import nothing from programs.
After: see the search below.

## Decisions (by ownership)

| What | Decision | Why |
| --- | --- | --- |
| `database-manager/storage/*` (SQLite repo, pool, queue, file repo, tests) | moved to `framework/persistence/repository/` | Backend code never lives in a program; the framework needs it. `database-manager/index.ts` keeps re-exporting `FileRepository`, `sqlite-repository`, `types` so `fluxiq/database-manager` (used by the Extension: `apps/product/.../seed-workspace.ts`) and the root entry keep their names. |
| `database-manager/types.ts` (`Repository`, `RepositoryScope`, `RecordEnvelope`, `Migration`...) | moved whole to `framework/persistence/repository/types.ts` | Path-only tool cannot split a file. It also holds `DatabaseManagerStoreSummary`/`DatabaseManagerSnapshot` DTOs, which now sit in framework; splitting them back out is a small later cleanup. |
| `_shared/storage.ts`, `state-connections.ts`, `state-root.ts` + their 3 tests | moved to `framework/persistence/program-state/` | Persistence of program state; framework is the consumer (59 imports). |
| `_shared/performance-metrics.ts` + test | moved to `framework/persistence/performance-metrics/` | Used by the repository and project database; `_shared/api.ts` consumes it, the right direction. |
| `ProgramResourceOwnerResolver` (a 4-line port type) | declared in new `framework/persistence/resource-owner/owner-resolver.ts`; removed from `_shared/iam/types.ts`; `_shared/iam`, `_shared/api.ts` and `ownership.ts` import it | Inversion. The program IAM gate consumes the port, the framework implements it. The rest of `_shared/iam` depends on `_shared/api.ts` and identity-access, so it is program-level and stays. |
| `ProgramApiIamOptions` used by `framework/index.ts` | `framework/index.ts` imports it from the catalog barrel `programs/index.ts`, which gained `export type { ProgramApiIamOptions }` | Host composition is the catalog's job. New type-only public name. |
| `_shared/api.ts`, `types.ts`, `catalog.ts`, `runtime.ts`, `docs-generators.ts`, `authorization.ts`, `iam/`, `password-kdf/`, other `_shared/tests` | stay | Program-level (they compose or gate programs). |
| Seven `_shared` importers inside programs | repointed by the tool (database-manager and identity-access/secret-keys services import the repository types via `database-manager/index.ts`, which still re-exports them) | |
| Stored paths `.fluxiq/data/programs/...`, routes `/api/programs/...` | untouched | Only `src/`/`dist/`-prefixed paths and module specifiers are rewritten. |

No forwarding file exists at an old path. Public names: `programs/index.ts` still re-exports the
same modules from their new files, so `fluxiq` root and `fluxiq/database-manager` expose the same
names; `programs/index.ts` and `database-manager/index.ts` are re-export barrels, not forwarders.

## Not done, and why (residual edges, all type or test imports)

- `framework/persistence/automation/ownership/{default-owner,ownerships,types}.ts` import
  `adminRole`, `IdentityAccessService`, `User` from `programs/identity-access`. Identity Access is a
  full backend inside a program (service, sessions, providers). Fixing it means moving that
  backend to `platform/iam` or giving ownership its own port types: code edits.
- `runtime/conversations/commands/port.ts` (+ its test) import `GlobalProgramApiRegistry`,
  `ProgramApiActor`, `ProgramScope` from `_shared/api.ts` and `_shared/types.ts`. Needs the port to
  declare structural types of its own (a code edit); `_shared/types.ts` could then move to
  `api-contracts`.
- Tests in `framework/tests` and `runtime/llm/**/tests` use `SecretKeysService`/`IdentityAccessService`
  as real collaborators (5 files). Either they get fakes (code edits) or they move under
  `programs/secret-keys/tests`.
- `platform` tests import `_shared/runtime.ts` and `identity-access`; `platform` is not in the
  brief's four areas, so those are not banned.

The new rules ban everything else; these specific targets are excluded in the config comment and
the `forbiddenImports` reason text, so each removal can then tighten the rule.

## Audit change (`scripts/structure-audit/config.mjs`; the mirrored files are unchanged)

- `importBoundaries`: for api-contracts, client-gateway, core, domains, flows, framework, io,
  platform, runtime, ui, no import under `programs/{background-tasks,compute-control,
  database-manager,deployment-sync,docs,production-runner,runtime-control}`, `programs/_shared/iam`,
  `_shared/password-kdf`, `_shared/tests`. (The Studio ban already existed.)
- `forbiddenImports` for core, flows, framework, runtime: any `programs/_shared/<file>.ts` except
  `api.ts`, `types.ts`, `catalog.ts`. `programs/index.ts` (the catalog) is the only other allowed
  target. Both apply to tests. Kept in config.mjs so the Extension's mirror check is not affected.
- `.structure-baseline.json`: paths of moved files rewritten by the tool; `--update` reported
  "0 lowered, 0 removed", no entry raised.

## Repeatable move

Tool: `git show 599a96c7a^:scripts/refactor/move-owners.mjs`, kept in scratch with two additions
(`MOVE_ROOT`/cwd as the root instead of the script's grandparent; a manifest `redirects` list that
retargets `programs/database-manager/index.ts` imports from outside `programs/` to the repository
file, since an index cannot be moved). The patched copy is at
`C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff-FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/refactor/move-owners.mjs`
(original beside it as `move-owners.orig.mjs`; diff them to re-create it).
Manifest: `docs/working/studio-controller-plan/moves/programs-shared.json`. Edits a path-only
tool cannot make: `docs/working/studio-controller-plan/moves/programs-shared.post.mjs`
(idempotent). Run from the Core root on the newest dev:

```text
MOVE_ROOT=$PWD node <scratch>/refactor/move-owners.mjs docs/working/studio-controller-plan/moves/programs-shared.json --dry-run
MOVE_ROOT=$PWD node <scratch>/refactor/move-owners.mjs docs/working/studio-controller-plan/moves/programs-shared.json
MOVE_ROOT=$PWD node <scratch>/refactor/move-owners.mjs docs/working/studio-controller-plan/moves/programs-shared.json --verify HEAD
node docs/working/studio-controller-plan/moves/programs-shared.post.mjs
node scripts/structure-audit.mjs --update
```

The config.mjs additions are not scripted; keep them from this worktree's diff. Tool gap found: a
dist-relative string `load("programs/_shared/storage.js")` in `recordings/tests/process-probe.mjs`
is not a specifier; the post script rewrites it. If dev gains another such string the search below
finds it (`grep -rn "_shared/\(storage\|state-\|performance\)\|database-manager/\(storage\|types\)"`).

## Commands run and observed

- `--verify HEAD` -> `{"compared":107,"problems":0}` (every moved or edited code file has the same
  tokens as at HEAD except module specifiers and named paths). The 6 post-script edits are outside
  that proof; they are the ones listed above and visible in `git diff`.
- Move totals: `{"moved":15,"edited":104,"specifiers":112,"paths":3,"comments":0,"prose":69}`.
- `pnpm.cmd --filter fluxiq check` (tsc --noEmit) -> passed, run twice (before and after the final
  edits); no diagnostics.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (481 warning(s), 1098 baselined).`
- Bad import: temporary `runtime/tests/zz-bad-import-probe.test.ts` importing
  `../../programs/_shared/runtime.ts` and `../../programs/docs/index.ts` -> 2 FAIL lines
  (`[imports] ...: imports "../../programs/_shared/runtime.ts". A program's shared files...` and
  `...which resolves under packages/fluxiq/src/programs/docs/.`), `2 violation(s)`. A
  `framework` file importing `../programs/index.ts` was accepted. Both probe files removed; audit
  passes again.
- vitest (`--minWorkers 1 --maxWorkers 2 --reporter=dot`) over `framework/persistence/{program-state,
  repository,performance-metrics,automation/ownership}`, `framework/automation-service/service/projects`,
  `programs/_shared/tests`, `programs/database-manager`, `runtime/conversations/commands/tests/port.test.ts`
  -> `Test Files 32 passed (32), Tests 163 passed (163)`, 390 s. A first, broader run (all of
  `framework/persistence`, `platform/iam`, `runtime/conversations`) was stopped by me after about 20
  minutes, not completed.
- Search (framework, runtime, flows, core import lines containing `programs/`): flows and core none;
  framework: `../programs/index.ts` (catalog) plus the identity-access (4) and secret-keys (3, tests)
  residuals; runtime: `_shared/api.ts` (2), `_shared/types.ts` (1), secret-keys (2 tests),
  identity-access (1 test), secret-keys (1 test) as listed above.
- Core libraries rebuilt (`pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`, fluxiq 502 s), then in the Extension worktree `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> `core-build: ... is current with its source.` and `{"build-cache":"build","step":"domain:check",..."ms":80869}`, exit 0, no diagnostics. Extension needed no edits.

## Not verified

- Whole-package suites, Lab, browser, live paths, `apps/web` typecheck (its three files that name
  `programs/_shared/api.ts` are unchanged; api.ts did not move).
- The emitted `dist` layout was not exercised except by the library build used for the Extension check.
- Biome (`biome.json` paths were rewritten by the tool; lint not run).

## Open questions

- Are the residual identity-access / port.ts edges to be a follow-up with code changes?
- `database-manager/types.ts` moved whole; split `DatabaseManager*` DTOs back to the program?

## Second pass: residual edges closed (coordinator instruction)

Result: framework, runtime, flows and core import nothing from `programs/` except
`framework/index.ts -> ../programs/index.ts` (the catalog). Search output (import lines containing
`programs/`): flows none, core none, runtime none, framework only that one.

| Edge | Decision |
| --- | --- |
| `ownership/{default-owner,ownerships,types}.ts` -> identity-access | Framework declares `AutomationStudioProjectOwnerCandidate` (4 fields) and a new `AutomationStudioProjectOwnerDirectory` port (`snapshot()` returning users) in `ownership/types.ts`. `default-owner.ts` holds `ADMIN_ROLE_ID = "admin"` (same value as `adminRole.id`; a test still proves it against the real service). `IdentityAccessService` satisfies the port structurally; tsc proves it at the one call site. |
| `runtime/conversations/commands/port.ts` -> `_shared/api.ts`, `types.ts` | Port declares `AutomationStudioConversationCommandActor`, `...Scope`, `...Registry` (call + endpoints). `GlobalProgramApiRegistry` satisfies the registry (method-syntax bivariance; actor is optional in the port's request type for that reason). `_shared/types.ts` stays: now no framework importer. |
| `port.test.ts` | The two port tests need the real registry, so they moved verbatim (reformatted to one statement per line, same assertions) to `src/tests/conversation-command-port.test.ts`; the caller and vocabulary tests stay. |
| 5 tests using real `SecretKeysService`/`IdentityAccessService` | All five are real integrations (key unlock, revocation, authorization), so no test doubles: moved unchanged to `src/tests/` (nearest directory holding both subjects) via `programs-shared-tests.json`: `instance-leak`, `model-provider-disabled-run`, `anthropic-session-panel`, `deepseek-session-key`, `session-key-provider`; plus `ownership-default-owner` (uses the real Identity Access). Their imports of framework/runtime directories now use those directories' barrels (audit imports rule). No assertion changed, no test dropped. |
| `framework/index.ts` | It imports from the catalog barrel: runtime values `createGlobalProgramRuntime`, `buildProgramDirectory`, `registerHostDocumentationGenerators`, and types `HeldKeys`, `GlobalProgramRuntime`, `ProgramDirectory`, `ProgramApiIamOptions`. So it is not type-only: the `FluxIQ` host composes the program runtime and the catalog directory by design. It no longer takes `programStateConnections` from the catalog (framework owns it now; imported from `persistence/program-state`). `src/index.ts` also re-exports the catalog but lies outside the four areas. |

Audit: the forbiddenImports entries and exceptions from pass one are removed. `importBoundaries` now
lists every directory under `programs/` (read from disk, so new programs are covered) for api-contracts,
client-gateway, core, domains, flows, framework, io, runtime, ui. `programs/index.ts` is a file, so it is
the only target left. Bad import check, second pass: a framework test importing `identity-access`, `_shared/types.ts`
and `programs/index.ts` gave 2 FAIL lines (the first two) and the catalog import passed.

`platform` (out of scope) still imports: `_shared/runtime.ts` (`live-registry.test.ts`,
`live-role-parity.test.ts`) and `programs/identity-access/index.ts` (`live-role-parity.test.ts`,
`provisioning/tests/{last-administrator,refuse-first,restart-fixture,sqlite-services}`), all tests.

Hand edits (not path-only) now, all scripted in `programs-shared.post.mjs` except `config.mjs`:
`framework/index.ts`, `programs/index.ts`, `programs/_shared/{api.ts,iam/*}`, ownership `{types,default-owner,ownerships}.ts`,
`commands/port.ts`, `commands/tests/port.test.ts` (+ new `src/tests/conversation-command-port.test.ts`, stored as
`moves/programs-shared.conversation-command-port.test.txt`), the barrel imports in moved tests, `process-probe.mjs`,
and `scripts/structure-audit/config.mjs` (copy from this worktree). `--verify HEAD` over both manifests: `{"compared":125,"problems":14}`;
the 14 are exactly those hand-edited files (13 source files + config.mjs), every other compared file is path-only.
Order on newest dev: `programs-shared.json`, `programs-shared-tests.json`, `programs-shared.post.mjs`, `node scripts/structure-audit.mjs --update`.

Second-pass checks: `node scripts/structure-audit.mjs` -> `passed (480 warning(s), 1097 baselined)` (update: 0 lowered, 1 removed,
the old `port.test.ts` statement-packing entry); `pnpm.cmd --filter fluxiq check` passed;
`apps/web`: `npx tsc --noEmit` no output (exit clean); vitest on `src/tests`, `runtime/conversations`, `ownership`, `program-state`, `repository`,
`performance-metrics`, `conversation-requests`, `service/projects`, `programs/_shared/tests`, `programs/database-manager` ->
`Test Files 61 passed (61), Tests 436 passed (436)`; after the last host import edit, `instance-leak` and `model-provider-disabled-run` ->
`2 files, 6 tests passed`. Biome: `biome lint` over the moved storage files and `api.ts` -> 2 warnings (existing non-null assertions in `storage.ts`, unchanged code);
`biome check biome.json` reports format errors on whole files because this checkout has CRLF line endings (any file shows it), not from the edit.
