# core-oversized-tests

## Outcome

Done. Both oversized test files are gone, replaced by 20 files. The largest
file in scope is now 505 lines (`api/handlers/tests/llm-generation.test.ts`),
down from 1,135. All 64 test-case names and their pass/fail statuses are
identical before and after.

## What changed and why

### (a) `api/tests/handlers.test.ts` (1,135 lines, 34 cases) to `api/handlers/tests/` (10 files)

Split by `describe` block, because a whole `describe` is the smallest unit
that preserves a case's *full* name (vitest reports `<describe> <it>`), and
each block already mapped onto exactly one of the 21 subject modules the
`core-handlers-split` worker created. One file per subject module covered:

| New file | describe block(s) moved | Subject module | Cases |
| --- | --- | --- | --- |
| `llm-execution-settings.test.ts` | Flow LLM execution settings API validation | `handlers/llm-execution-settings.ts` | 2 |
| `instruction-scope.test.ts` | flowInstructionScopeFromPayload | `handlers/instruction-scope.ts` | 6 |
| `instructions.test.ts` | Automation Studio instruction readiness API | `handlers/instructions.ts` | 1 |
| `llm-generation.test.ts` | Automation Studio LLM execution API | `handlers/llm-generation.ts` | 15 |
| `flows.test.ts` | Automation Studio graph patch API | `handlers/flows.ts` | 1 |
| `caches.test.ts` | Automation Studio project UI cache API | `handlers/caches.ts` | 3 |
| `projects.test.ts` | Automation Studio hierarchy page API; Automation Studio Problems paging API | `handlers/projects.ts` | 3 |
| `client-gateway.test.ts` | Automation Studio Client Gateway paging API | `handlers/client-gateway.ts` | 1 |
| `router.test.ts` | Automation Studio Router target-reference API | `handlers/router.ts` | 1 |
| `subflows.test.ts` | Automation Studio explicit legacy representation migration API | `handlers/subflows.ts` | 1 |

Two `describe`s (hierarchy pages, Problems paging) both register against
`handlers/projects.ts`, so they share `projects.test.ts` rather than inventing
a second subject.

### (b) `programs/tests/global-services.test.ts` (945 lines, 30 cases) to 10 files in `programs/tests/`

No source split to mirror, so the single `describe("global program services")`
was grouped by the service each case constructs and exercises. Every file
re-opens the same `describe`, so full case names are unchanged.

| New file | Concern | Cases |
| --- | --- | --- |
| `global-program-runtime.test.ts` | `createGlobalProgramRuntime` endpoint registration | 1 |
| `global-background-tasks.test.ts` | scheduling, controls, persisted countdown state | 5 |
| `global-compute-control.test.ts` | nodes, commands, leases | 1 |
| `global-database-manager.test.ts` | repository summaries, credential recheck | 2 |
| `global-deployment-sync.test.ts` | target sync through an adapter | 1 |
| `global-docs.test.ts` | snapshots, rendering, source roots, generated reference | 6 |
| `global-identity-access.test.ts` | users, sessions, credentials, PIN, 2FA | 10 |
| `global-automation-studio-workspaces.test.ts` | legacy folder-backed project workspaces | 2 |
| `global-secret-keys.test.ts` | key creation and TOTP-gated reveal | 1 |
| `global-production-runner.test.ts` | run start/stop | 1 |

### Shared fixtures, and why they sit where they do

Seven of the handler suites shared `createCacheApiTestService` and
`cacheActor`; three of the global suites shared `actorFor` and
`testTotpCode`. Duplicating them seven times would have been worse structure
than the problem being fixed, so each pair became a module.

`api/handlers/tests/` is **nine path segments deep**, and `naming`'s depth
rule exempts test files but not plain `.ts` modules, and does not ratchet — a
support module there would have been an unbaselineable hard failure. So the
handler fixtures live one level up in `api/tests/` (eight segments, which
passes) as `test-service.ts` and `test-actor.ts`, and `api/tests/` now holds
only those two. The global fixtures (`login-actor.ts`, `totp-code.ts`) sit in
`programs/tests/` at six segments, no constraint.

### Imports routed to avoid manufacturing `imports` failures

The `imports` rule keys per importing file and fails outright on a key with no
baseline record. The old test reached `../../runtime/service.ts` (its single
baselined skip); replicating that across 10 new files would have created 10
new failing keys. `test-service.ts` now imports `AutomationStudioService` from
`../../runtime/index.ts` instead. Every other specifier in every new file is
exempt by construction: `../index.ts` (barrel), `../../contracts.ts` (resolves
to a directory), `../../../../_shared/api.ts` (`_shared` has no barrel),
`../../tests/*.ts` (`api/tests` has no barrel), `client-gateway/index.ts`
(barrel). Net effect: the baselined skip disappears and no new one appears.

Nothing outside my owned paths was touched. No assertion, case name, or
`describe` title was changed; helper bodies were moved verbatim, with
`testHashSecret` left inline in `global-identity-access.test.ts` (its only
user) and `decodeBase32` made private to `totp-code.ts` (its only user).

## Commands run and observed results

Before-state, on the tree as I received it:

```
npx vitest run src/programs/automation-studio/api/tests/handlers.test.ts \
               src/programs/tests/global-services.test.ts --reporter=json
  -> numTotalTests 64, passed 64, failed 0  (34 handlers + 30 global)

node scripts/structure-audit.mjs
  -> exit 1; "structure-audit: 33 violation(s) across 3 rule(s)"
     (none in my paths; other workers' trees in flight)
```

After:

```
npx vitest run src/programs/automation-studio/api/handlers/tests \
               src/programs/tests --reporter=json
  -> 22 files, 72 tests, 72 passed, 0 failed
     (72 = my 64 plus 8 pre-existing in programs/tests/index.test.ts and
      permission-matrix.test.ts, which I did not touch)

diff --strip-trailing-cr before-names.txt after-all-names.txt
  -> no output. 64 sorted "full case name + status" rows identical.
     Verified twice: once per suite, once combined.

npx tsc --noEmit   (in packages/fluxiq)
  -> exit 2, exactly one error, not mine:
     src/programs/automation-studio/runtime/tests/asfacade-projects-probe.test.ts(7,76):
     error TS2307: Cannot find module '../service-baseline-probe.ts'
     That is the runtime/service.ts worker's in-flight scratch probe.
     Zero errors in any file I own.

node scripts/structure-audit.mjs
  -> exit 1; "structure-audit: 33 violation(s) across 3 rule(s)" — unchanged.
     diff against the before-run adds exactly one line:
       warn [file-lines] .../api/handlers/tests/llm-generation.test.ts:
            505 lines is past the 400-line advisory threshold.
     No new FAIL anywhere. "9 baseline entries can be lowered."
```

Line counts in scope, largest first: 505, 364, 194, 193, 144, 133, 115, 113,
85, 53, 45, 44, 41, 35, 35, 30, 29, 24, 23, 21, 18, 16, 14, 10. Limit is 800.

Completeness was also checked structurally, not just by count: every non-blank
line of both originals is either inside a moved range or is one of the import
and helper lines I reproduced deliberately — a script enumerated the uncovered
lines and printed them for inspection. A second script confirmed no new file
carries an unused import (the package does not set `noUnusedLocals`, so tsc
would not have caught one).

## Not verified

- `pnpm check` and `pnpm test` as a whole. Two other workers are mid-flight in
  this package and one already breaks `tsc` with a scratch file, so a
  package-wide run could not have attributed its result to me. I scoped every
  run to my own paths, as briefed.
- The baseline was **not** regenerated (`pnpm structure:baseline` is the
  supervisor's call). Three baseline entries are now stale-high and should
  fall out on the next regeneration: `file-lines` for
  `api/tests/handlers.test.ts` (1135) and
  `programs/tests/global-services.test.ts` (945), and `imports` for
  `api/tests/handlers.test.ts` (1). All three are deletions, never raises.
- No behavioural claim beyond "the same 64 cases still pass" — I changed no
  assertion, so the suites prove exactly what they proved before.

## Open questions or contradictions found

- `llm-generation.test.ts` (505 lines) trips the 400-line *advisory* warn.
  I left it whole on purpose: its 15 cases are one `describe` covering one
  subject module, and the only further seam available (pulling out the two
  cases that also call `runRuntimeSession`, `handlers/runtime-execution.ts`)
  would still leave roughly 430 lines behind while splitting a coherent grant
  lifecycle across two files. Warnings do not ratchet, and the brief's bar is
  800. Flagging rather than acting.
- `api/tests/` now contains two fixture modules and no test file. That reads
  oddly, and the cause is the depth rule, not a judgement call — see above.
  If the plan would rather have a `tests/` directory always contain tests, the
  alternative is raising `maxPathSegments` or exempting non-test modules that
  live under a `tests/` root, which is a rule change and out of my scope.
- Six of the ten new `programs/tests/` files hold a single case. That follows
  the "group by the service each exercises" instruction literally; the
  alternative was inventing composite buckets with no counterpart in the
  source tree. Worth a supervisor's eye.
