# Worker report: core-fluxiq-studio

Brief: `### Brief: core-fluxiq-studio`, Phase 1 dispatch — 2026-09-10.
Subtree owned: `packages/fluxiq/src/programs/automation-studio/**`.

## Outcome

Done. All 87 co-located test files moved into `tests/` subfolders, 234
relative import specifiers repaired, collection proven identical test-for-test
before and after.

## What changed and why

87 `*.test.ts` files moved by `git mv` into a `tests/` subfolder of the
directory that owns their subject, filenames unchanged:

| Directory | Files |
| --- | --- |
| `storage/tests/` | 35 |
| `runtime/tests/` | 32 |
| `model/tests/` | 9 |
| `testing/tests/` | 4 |
| `nodes/tests/` | 3 |
| `api/tests/`, `client-gateway/tests/`, `dsl/tests/`, `fingerprinting/tests/` | 1 each |

`testing/` was handled as the brief requires: only its four `*.test.ts` moved.
`testing/index.ts` re-exports `./scale-baseline.ts`, `./scale-certification.ts`,
`./scale-fixtures.ts` and `./scale-graph-store.ts`; all four fixture modules and
the barrel stayed exactly where they were, so the public
`fluxiq/automation-studio` surface is untouched.

Imports were repaired by one deepening rule applied only to module specifiers
(`from "…"`, `import("…")`, `vi.mock("…")`, `require("…")`): `./x` → `../x`,
`../x` → `../../x`. 234 specifiers across all 87 files. `git diff -M --numstat`
over the subtree reports `added=234 deleted=234` — exactly one changed line per
specifier, no incidental edits, no line-ending churn.

One relative-looking string literal was deliberately left alone:
`storage/tests/project-database.test.ts:54`,
`pool.acquire("../outside")` — a path-traversal rejection fixture, not a module
path. It was found by diffing every `./`/`../` string literal in the subtree
against the set of import specifiers, so it was the only such case.

No subject module was edited. No fixture, factory, or mock moved. Nothing
outside the subtree was touched: `git status --porcelain` over
`packages/fluxiq/src/programs/automation-studio` shows 87 `RM` entries and
nothing else.

## Commands run and observed results

**Counts before the move** (pristine tree, first run):

```
 Test Files  5 failed | 82 passed (87)
      Tests  9 failed | 662 passed (671)
```

**Counts after the move** (`npx vitest run "src/programs/automation-studio"`):

```
 Test Files  2 failed | 85 passed (87)
      Tests  3 failed | 668 passed (671)
```

Totals are identical: **87 test files, 671 test cases**, before and after.
Failures *dropped* from 9 to 3; see "pre-existing failures" below.

**Deterministic collection proof.** Execution counts in this repository are
noisy (below), so the authoritative check was `npx vitest list
"src/programs/automation-studio"`, which collects without running:

- before: 671 lines, 87 unique files
- after: 671 lines, 87 unique files
- normalising the inserted `/tests/` path segment (`sed 's|/tests/|/|'`) and
  diffing the two sorted lists: **no differences**. Every one of the 671 test
  cases is still collected, from the same file, under the same suite and name.

This is the check the brief asked for. A suite that stopped being matched by a
glob would show up here as a missing block of lines; none did.

**Package-level run** (`pnpm --filter fluxiq test`), which also covers the
concurrent `core-fluxiq-core` worker's 18 moved files:

```
 Test Files  3 failed | 101 passed (104)
      Tests  4 failed | 790 passed (794)
     Errors  1 error
```

104 of 105 on-disk files ran. The one that did not is
`automation-studio/storage/tests/state-index.test.ts`, lost to
`Error: Worker exited unexpectedly` (a tinypool child-process crash). Run on its
own it passes: `Test Files 1 passed (1) / Tests 5 passed (5)`, 17 ms. The same
crash class hit the **pristine, pre-move** tree in a second baseline run, taking
down two *different* files (`storage/memory-repository.test.ts` and
`testing/scale-fixtures.test.ts`) and reporting `Test Files 4 failed | 81 passed
(86)`. It is pre-existing, non-deterministic, and picks a different victim each
run, so it is not attributable to this change.

**Structure audit** (`node scripts/structure-audit.mjs --rule test-placement
--json`): `failures: []`, and no entry anywhere in the output naming
`packages/fluxiq/src/programs/automation-studio`. Human-readable form:
`structure-audit: passed (0 warning(s), 0 baselined)`, exit 0. My nine
directories disappeared from the rule's findings entirely, which the brief
permits as the alternative to appearing in `lowerable` — the rule
(`scripts/structure-audit/rules/test-placement.mjs`) only emits a finding for a
directory that *still* co-locates tests, so a directory at zero produces nothing
to lower. `.structure-baseline.json` still carries its 70 stale entries,
including `packages/fluxiq/src/programs/automation-studio/storage` and
`…/runtime`. As instructed, I did **not** run `pnpm structure:baseline`.

**Typecheck** (`pnpm --filter fluxiq check` → `tsc --noEmit`): clean, no output,
exit 0. `tsc --listFilesOnly` confirms all 87 moved test files are in the
program, so this is a real check of the repaired imports and not a vacuous pass.

**Independent resolution check.** A script re-parsed every relative specifier in
the moved files and resolved it against the filesystem
(`x`, `x.ts`, `x.tsx`, `x/index.ts`): `specifiers checked: 234, unresolved: 0`.

## Pre-existing failures (not caused by this work)

Three test cases fail after the move. All three also failed before it, on the
untouched tree:

- `runtime/tests/service.test.ts > AutomationStudioService recording persistence
  > approves edited recording Flow proposal graphs into Flows` — a genuine
  assertion mismatch, `label` is `"Edited click proposal"` where the test expects
  `"Reapplied click proposal"` (`service.test.ts:2099`).
- `runtime/tests/service.test.ts > … > turns mapped observations into reviewed
  Flow actions without making action inputs policy state`.
- `runtime/tests/service-subflow-pagination.test.ts > … > does not hydrate a
  stale legacy index when a typed SQL filter has zero matches`.

The six additional failures seen in the pre-move baseline were contention
artifacts — `Test timed out in 60000ms` and `EBUSY: resource busy or locked,
unlink …project.sqlite-shm` on the million-event stream-store test — from
running heavy sqlite suites while another worker exercised the same package.
They cleared on the quieter post-move run.

## Not verified

- **`pnpm --filter fluxiq test` was never observed green**, and cannot be: the
  suite was already red on the untouched tree. The brief's "observed passing"
  was not achievable; "same counts, no new failures" was, and is evidenced above.
- **No package-level before/after comparison exists.** A `pnpm --filter fluxiq
  test` baseline for the whole package could not be captured — by the time I
  started, the concurrent `core-fluxiq-core` worker had already moved 18 files in
  the same package. My before/after comparison is therefore scoped to my subtree
  via the `"src/programs/automation-studio"` path filter, which is exactly the
  set I own. The package-level number above is an after-only observation.
- The package run's fourth failure,
  `src/programs/_shared/tests/runtime-llm-grants.test.ts > … > issues a sanitized
  build grant against the exact binding and rejects it after settings drift`,
  is in the `core-fluxiq-core` worker's subtree. I did not investigate it.
- `pnpm --filter fluxiq build` was not run — `tsconfig.build.json` is owned by
  `core-fluxiq-core`, and their brief covers the `exclude` change and the build
  check. I observed that they had already changed it.
- No browser or runtime behaviour was exercised. This change is textual.

## Open questions or contradictions found

1. **The brief's audit acceptance criterion does not fit the rule.** It requires
   my directories to "appear in `lowerable` or disappear entirely". Because
   `test-placement` emits nothing for a directory at zero co-located tests, a
   fully-cleaned directory can *only* disappear — `lowerable` is empty repo-wide
   for this rule now. The stale baseline entries still need dropping; that is the
   supervisor's `--update` pass, as the brief already says.
2. **`packages/fluxiq/.tmp/` is untracked and not gitignored.**
   `git check-ignore packages/fluxiq/.tmp` returns nothing, yet the storage
   suites create it (sqlite project files, WAL/shm). It appeared in
   `git status` as `?? packages/fluxiq/.tmp/` after my first test run and is a
   disposable run artifact that must not be committed. Worth an ignore rule.
   I did not add one — `.gitignore` is outside my subtree.
3. **A flaky vitest worker crash affects this package.** `Error: Worker exited
   unexpectedly` silently drops an entire test file from the run while the suite
   still reports as "passed" for the survivors. It hit the pre-move tree and the
   post-move tree, on different files each time. This is precisely the failure
   mode the dispatch's counting rule is meant to catch, and it is present
   independently of the migration. Anyone validating Phase 1 by eyeballing a
   summary line should compare `vitest list` output instead.
