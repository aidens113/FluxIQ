# Report: core-storage-split (Phase 2)

Worker: core-storage-split
Repository: FluxIQ Core (`F:\!FluxIQ`), branch `dev`
Date: 2026-09-10

## Outcome

**Partial.** The split is done, the public surface is provably unchanged, and
the storage test suite is bit-for-bit unchanged. Two things block "Done", and
neither is inside my owned paths:

1. **`storage/project/hierarchy/` is forbidden by the depth rule.** Files
   there sit at 9 path segments against `maxPathSegments: 8`, and the
   `naming` depth finding is `ratchet: false` — it **cannot** be baselined
   away. `pnpm check` cannot pass with that directory present until the limit
   or the exemption list changes, and both live outside `storage/`.
2. **Three files outside `storage/` imported `storage/project-*` internals.**
   The brief states "Nothing outside `storage/` imports its internals today
   (verified: zero barrel-skipping importers)". That is not true; they are
   all under `runtime/**`, which the brief forbids me to touch and which
   `core-runtime-split` is editing concurrently. They are listed below with
   their one-line fixes.

## What changed and why

### Source moves (23 files, all `git mv`, history preserved)

20 `project-*` files → `storage/project/` with the prefix stripped
(`project-adaptation-store.ts` → `project/adaptation-store.ts`, and so on for
administration, compiled-plan-store, content-protection, content-store,
database, event-chunk-store, event-stream-writer, flow-resource-mutations,
flow-resource-repository, graph-store, migration-cutover,
object-index-migration, object-repository, retention-store,
reusable-llm-context-store, runtime-stream-store, schema, ui-cache-store,
unit-of-work).

3 `project-hierarchy-*` files → `storage/project/hierarchy/{feed,mutations,repository}.ts`.

No exported symbol was renamed. Only paths moved.

### Test moves (24 of 35 moved, 11 stayed)

21 tests → `storage/project/tests/`, 3 → `storage/project/hierarchy/tests/`,
each losing the `project-` / `project-hierarchy-` prefix to match its subject.

Four tests in `storage/tests/` had no 1:1 subject file, so I placed each in
the `tests/` folder of the nearest directory containing all its subjects:

| Test | Subjects | Placed in | Why |
| --- | --- | --- | --- |
| `project-durability.test.ts` | `project-database.ts` only | `project/tests/durability.test.ts` | single subject, moved |
| `project-object-stream-edge-cases.test.ts` | administration, content-store, database, event-chunk-store | `project/tests/object-stream-edge-cases.test.ts` | all four subjects moved into `project/` |
| `project-query-plan.test.ts` | administration, database, **`query-plan.ts`** | stayed in `storage/tests/` | `query-plan.ts` stays in `storage/`, so `storage/` is the nearest common directory |
| `project-hierarchy-scale.test.ts` | database, hierarchy-repository, **`query-plan.ts`** | stayed in `storage/tests/` | same reason |

The two that stayed keep their filenames — they did not change directory, so
renaming them would have been churn. Their imports now go through
`../project/index.ts` (two import statements merged into one each), which the
`imports` rule exempts because it is a barrel.

### Barrels

- New `storage/project/hierarchy/index.ts` — 3 `export *` lines.
- New `storage/project/index.ts` — re-exports the 23 moved modules in the
  order `storage/index.ts` used, **preserving the explicit named-export block
  for `administration.ts`** (it was never `export *`; it exported 7 values and
  7 types by name, and widening it would have changed the surface).
- `storage/index.ts` shrank from 37 export statements to 14; the only
  behavioural line is `export * from "./project/index.ts"` replacing the 23
  individual `project-*` re-exports.

### Import rewrites

`catalog.ts`, `query-plan.ts`, `schema-migrations.ts` and
`tests/schema-migrations.test.ts` previously imported `./project-database.ts`.
They now import `./project/index.ts` (the barrel) rather than reaching into
`project/`'s files — the rule's intent, and free for the three whose import is
`import type`. `catalog.ts`'s is a value import
(`AutomationStudioProjectDatabase.open`), so it now eagerly loads the whole
`project/` barrel; nothing under `project/` imports `catalog.ts`, so there is
no cycle, only a marginally wider eager-load that `storage/index.ts` already
performed anyway.

I did **not** route `project/*` → `../schema-migrations.ts` (12 files),
`../paging.ts` (2) and `../file-store.ts` (1) through `../index.ts`. That
would be exempt from the `imports` rule but would make every project module
depend on the whole `storage` barrel, producing a real value-level cycle
(`storage/index` → `project/index` → `project/administration` →
`storage/index`) for a class used at runtime. That is the "route tests through
barrels" workaround `Current State` already rejected once, applied to sources.
They stay as direct relative imports and show up as findings — quantified
below.

## Commands run and observed results

### 1. Public surface — the primary evidence

The literal `export` lines of `storage/index.ts` necessarily change (the
paths moved), so I compared the thing that actually is the contract: the
**resolved export symbols** of `storage/index.ts`, via the TypeScript checker
(`checker.getExportsOfModule`) against `packages/fluxiq/tsconfig.json`, each
row `name<TAB>flags=<SymbolFlags>`, sorted. Script:
`…/scratchpad/storage-split/exports.mjs`.

```text
$ diff exports-before.txt exports-after.txt
<<no output: identical>>

before symbols: 323 / after: 323

$ md5sum exports-before.txt exports-after.txt
3bee10bd36e85788c7e68b765f834c67 *exports-before.txt
3bee10bd36e85788c7e68b765f834c67 *exports-after.txt
```

323 symbols in, 323 symbols out, identical names and identical symbol flags,
identical checksum. Nothing was added, removed, or widened — including the
`export {}`-beats-`export *` precedence of the `administration.ts` block,
which survives being pushed one level down into `project/index.ts`.

Statement counts, for completeness: `storage/index.ts` went from 37 `export`
statements to 14.

### 2. Tests — `pnpm --filter fluxiq test`, scoped

```text
$ npx vitest run --reporter=basic "automation-studio/storage/"    # BEFORE
 Test Files  35 passed (35)
      Tests  139 passed (139)

$ npx vitest run --reporter=basic "automation-studio/storage/"    # AFTER
 Test Files  35 passed (35)
      Tests  139 passed (139)
```

Unchanged, and all 35 ran from their new paths (24 under `project/tests/` and
`project/hierarchy/tests/`, 11 under `storage/tests/`). The package's four
known pre-existing failures (`service.test.ts`,
`service-subflow-pagination.test.ts`, `runtime-llm-grants.test.ts`) are
outside `storage/` and were neither triggered nor touched; my subtree was
green before and is green after.

### 3. Type check — `npx tsc --noEmit` in `packages/fluxiq`

```text
errors in files under src/programs/automation-studio/storage/ : 0
errors referencing a stale "storage/project-*" path            : 3
```

The three:

```text
src/programs/automation-studio/runtime/reusable-llm-context.ts(2,63): error TS2307:
  Cannot find module '../storage/project-reusable-llm-context-store.ts'
src/programs/automation-studio/runtime/tests/reusable-llm-context.test.ts(2,63): error TS2307:
  Cannot find module '../../storage/project-reusable-llm-context-store.ts'
src/programs/automation-studio/runtime/tests/service.test.ts(16,56): error TS2307:
  Cannot find module '../../storage/project-graph-store.ts'
```

All three exist at `HEAD` (`git grep … HEAD` confirms), so they are not the
concurrent runtime worker's doing. All three are under `runtime/**`, which my
brief lists under "Must not touch" and which `core-runtime-split` is editing
right now, so I left them. The minimal fix that keeps the existing `imports`
baseline keys unchanged is to insert one path segment:

```text
"../storage/project-reusable-llm-context-store.ts"    -> "../storage/project/reusable-llm-context-store.ts"
"../../storage/project-reusable-llm-context-store.ts" -> "../../storage/project/reusable-llm-context-store.ts"
"../../storage/project-graph-store.ts"                -> "../../storage/project/graph-store.ts"
```

A fourth importer, `automation-studio/api/contracts.ts:18`, had the same stale
path at `HEAD`; it is already gone from the working tree (the `core-api-contracts`
worker's edit), so it needs nothing.

The rest of `tsc`'s 213 error lines are the `core-runtime-split` worker's
in-flight `runtime/flow-bootstrap/` and `runtime/llm/` move. None is in
`storage/`.

### 4. Structure audit — `node scripts/structure-audit.mjs --json`

Both new barrels were `git add`ed first: the audit reads `git ls-files`, so
untracked files are invisible to it and the first run under-reported.

**`directory-files` — the point of the phase, and it worked**

| Directory | Before | After |
| --- | --- | --- |
| `storage` | 37 (baselined) | **14** |
| `storage/tests` | 35 (baselined) | **11** |
| `storage/project` | — | 21 |
| `storage/project/tests` | — | 21 |
| `storage/project/hierarchy` | — | 4 |
| `storage/project/hierarchy/tests` | — | 3 |

Zero `directory-files` findings under `storage/` after. Both frozen baseline
entries (37 and 35) can be lowered; every new directory is under the 25 cap
with room. Prefix groups inside the new directories max out at 2 members
(`content-`, `event-`, `flow-`, `object-`), so no new grouping is implied.

**`naming` — one entry cleared, four hard failures created**

Baseline before: `storage::project = 23` (ratcheted) — **gone**.

After, four **non-ratchetable** failures:

```text
naming | storage/project/hierarchy/feed.ts       = 9  limit=8  ratchet=false
naming | storage/project/hierarchy/index.ts      = 9  limit=8  ratchet=false
naming | storage/project/hierarchy/mutations.ts  = 9  limit=8  ratchet=false
naming | storage/project/hierarchy/repository.ts = 9  limit=8  ratchet=false
```

See "Open questions and contradictions" — this is the blocker.

**`imports` — 20 unbaselined keys, 26 newly flagged specifiers**

Baseline before, under `storage/`: 7 keys (`file-store.ts` 4,
`project-compiled-plan-store.ts` 2, and 1 each for `catalog-index-migration.ts`,
`catalog.ts`, `contracts.ts`, `project-adaptation-store.ts`,
`project-hierarchy-repository.ts`) — total value 11.

After, 20 unbaselined keys (all `ratchet: true`, so all baselineable), total
value 30, of which 4 are pre-existing findings whose key merely moved
(`adaptation-store` 1 of 2, `compiled-plan-store` 2 of 3,
`hierarchy/repository` 1 of 3):

```text
imports | storage/project/adaptation-store.ts           = 2   (1 pre-existing: ../../runtime/compiled-plan.ts)
imports | storage/project/administration.ts             = 1
imports | storage/project/compiled-plan-store.ts        = 3   (2 pre-existing: ../../runtime/{compiled-plan,executor}.ts)
imports | storage/project/flow-resource-repository.ts   = 2
imports | storage/project/graph-store.ts                = 1
imports | storage/project/hierarchy/feed.ts             = 4
imports | storage/project/hierarchy/mutations.ts        = 2
imports | storage/project/hierarchy/repository.ts       = 3   (1 pre-existing: ../../api/contracts.ts)
imports | storage/project/hierarchy/tests/feed.test.ts        = 1
imports | storage/project/hierarchy/tests/mutations.test.ts   = 1
imports | storage/project/hierarchy/tests/repository.test.ts  = 1
imports | storage/project/migration-cutover.ts          = 1
imports | storage/project/object-index-migration.ts     = 1
imports | storage/project/object-repository.ts          = 1
imports | storage/project/reusable-llm-context-store.ts = 1
imports | storage/project/runtime-stream-store.ts       = 1
imports | storage/project/schema.ts                     = 1
imports | storage/project/tests/schema.test.ts          = 1
imports | storage/project/tests/ui-cache-store.test.ts  = 1
imports | storage/project/unit-of-work.ts               = 1
```

**All 26 new ones are the same shape**: a file in a directory the prefix rule
just created, importing a module in its own parent or grandparent directory —
`../schema-migrations.ts` (12), `../paging.ts` (2), `../file-store.ts` (1),
`../administration.ts` / `../database.ts` / `../unit-of-work.ts` from
`hierarchy/` (7), and `../../{schema-migrations,query-plan,database}.ts` from
the new `tests/` folders (5, one level deeper than the existing tests
exemption reaches). Not one of them is a genuine new coupling; every one of
them was a same-directory import yesterday.

## Not verified

- **`pnpm check` as a whole.** I did not run it: the repository already fails
  it (`working-docs | docs/working/README.md` was the single failure before I
  started), and three other workers are mid-flight in this package. I ran the
  audit directly and diffed the findings for my directory instead.
- **`pnpm build` / `tsc -b tsconfig.build.json`.** Not run. `tsconfig.build.json`
  excludes `src/**/tests/**`, which already covers `project/tests/` and
  `project/hierarchy/tests/` with no change, but I did not prove the emitted
  `dist` layout or `scripts/rewrite-declaration-imports.mjs` behaviour on the
  new nesting.
- **Runtime import-order behaviour** of `catalog.ts` now loading the
  `project/` barrel eagerly. Reasoned about (no cycle: nothing under
  `project/` imports `catalog.ts`) and the 35 storage tests pass, but the full
  package test suite was not run, and `runtime/` is currently too broken by a
  concurrent worker to be a fair check.
- **Generated documentation.** `docs/reference/framework-reference.md`,
  `packages/fluxiq/docs/reference/framework-reference.md` and the
  `.fluxiq/cache/docs/` copies still cite `storage/project-*.ts:NN` source
  locations. They are generated by `pnpm docs:reference` and sit outside my
  owned paths; I did not regenerate them.
- **Authored documents** citing the old paths: `docs/architecture/code-structure.md`
  and four `docs/working/*` files. Supervisor's.
- **Biome.** `npx biome check` on the storage subtree processes 0 files —
  `biome.json` excludes the path — so formatting was not machine-checked. New
  files follow the surrounding style (LF, 2-space, double quotes, semicolons),
  matching the rest of the tree.
- `pnpm structure:baseline` was **not** run, per the brief.

## Open questions or contradictions found

### 1. Blocker: the `naming` depth rule forbids the directory the `naming` prefix rule demands

This is a straight contradiction inside the enforcement itself, and it is not
resolvable from inside `storage/`.

- `storage/project/hierarchy/feed.ts` is 9 path segments. `LIMITS.maxPathSegments`
  is 8. `depthFindings` emits `severity: "fail", ratchet: false`, so
  `pnpm structure:baseline` **cannot** absorb it. `pnpm check` fails forever.
- The deepest existing non-test, non-app-router source path in Core is exactly
  8 segments (155 files sit at 8; nothing is at 9). `depthExemptPrefixes` is
  `["apps/web/src/app"]` only. So `storage/` has exactly one nesting level of
  headroom, and Phase 2 as designed needs two.
- Flattening instead — `project/hierarchy-{feed,mutations,repository}.ts` —
  removes all four depth failures and 6 of the 20 `imports` keys, at the cost
  of **one** new ratchetable `naming` finding: `storage/project::hierarchy = 3`,
  whose message is literally *"Create project/hierarchy/ and strip the prefix
  from their names"*. Baselining that would freeze a violation the rules
  forbid anyone to fix.

I built it nested, as the brief specifies, because the alternative encodes an
unfixable loop into the baseline and because the fix is yours to make in one
line. Your options, in the order I'd rank them:

1. Raise `maxPathSegments` to 9 in `.structure-baseline.json`'s `limits`.
   Cost: the whole repository gets one more level of headroom. It also affects
   Phase 3 (`runtime/llm/`, `runtime/flow-bootstrap/` are at 8, fine) and
   Phase 4 (`apps/web/src/features/…/kind/` may want the same room).
2. Add a `depthExemptPrefixes` entry for `packages/fluxiq/src/programs`.
   Narrower, but it exempts the one tree most likely to keep growing.
3. Tell me to flatten to `project/hierarchy-*.ts` and accept the one frozen
   `storage/project::hierarchy = 3` entry. ~10 minutes.

`maxPathSegments` lives in `.structure-baseline.json`, which my brief lists
under "Must not touch", so I did not touch it.

### 2. The brief's premise about external importers is wrong

"Nothing outside `storage/` imports its internals today (verified: zero
barrel-skipping importers)." There were four at `HEAD` (three still live).
They are listed with their fixes in "Commands run", §3. Worth knowing *why*
the check missed them: a grep for `storage/project-…` that then filters out
lines containing `/storage/` also removes every `../storage/project-…`
importer, which is all of them. The reliable form is
`git grep -n 'storage/project-' -- '*.ts' | grep -v 'automation-studio/storage/'`.

Because `core-runtime-split` owns and is actively editing all three files, I
did not repoint them — the risk of a lost update outweighed leaving three
one-line errors that are trivially fixed by whoever holds those files next.

### 3. The `imports` rule needs the same exemption for split directories that it already has for split tests

The rule's own comment explains the tests exemption: *"Relocating tests one
level down turns the same-directory import exempted above into '../x', and
without this the barrel would have to widen its public surface purely so tests
can reach their subject."*

Applying the prefix rule does exactly that to **sources**. All 26 newly
flagged specifiers here are a file in `<dir>/<group>/` importing one of
`<dir>`'s own modules — `project/administration.ts` → `../schema-migrations.ts`
is the same import it was yesterday, written from one level down. The
symmetric exemption would be: a file under `<dir>/<child>/` may import
`<dir>`'s own modules, mirroring the existing `testRoots` clause and the
`targetDir === importerDir` clause above it. That is a one-condition change in
`scripts/structure-audit/rules/imports.mjs` and belongs to whoever owns that
rule, not to me. Phase 3's `runtime/llm/` and `runtime/flow-bootstrap/` will
hit it too, so it is worth deciding once, now.

Without it, the honest options are to freeze 20 entries in the `imports`
baseline (inflating a ratchet that `Current State` says was inflated by 130
once already and rolled back), or to move `schema-migrations.ts` (12 of the
26) and `paging.ts` (2) down into `project/` as well. The second is defensible
on its own terms — `paging.ts` has no consumer outside `project/` at all, and
`schema-migrations.ts` has exactly one (`catalog.ts`, which already imports
the `project/` barrel) — and it would cut the 20 keys to about 6. I did not do
it because the brief enumerates 23 files by name and I am not the right agent
to redraw the directory's membership mid-phase. Say the word and it is a
10-minute follow-up.

### 4. Baseline keys that moved (for your `structure:baseline` run)

These frozen entries now have no matching path; their successors carry the
identical value, so nothing rises:

```text
exported-values  storage/project-schema.ts::values          21  -> storage/project/schema.ts::values          21
exported-values  storage/project-migration-cutover.ts::values 16 -> storage/project/migration-cutover.ts::values 16
exported-values  storage/project-administration.ts::classes   6 -> storage/project/administration.ts::classes    6
exported-values  storage/project-ui-cache-store.ts::classes   3 -> storage/project/ui-cache-store.ts::classes    3
exported-values  storage/project-database.ts::classes         2 -> storage/project/database.ts::classes          2
file-lines       storage/project-schema.ts                  931 -> storage/project/schema.ts                   931
imports          storage/project-compiled-plan-store.ts       2 -> storage/project/compiled-plan-store.ts        3
imports          storage/project-adaptation-store.ts          1 -> storage/project/adaptation-store.ts           2
imports          storage/project-hierarchy-repository.ts      1 -> storage/project/hierarchy/repository.ts       3
naming           storage::project                            23 -> (cleared)
directory-files  storage                                     37 -> 14
directory-files  storage/tests                               35 -> 11
```

Three `imports` entries rise because the pre-existing cross-layer import is
now joined by a parent-reach import in the same file; resolving §3 returns
them to 2, 1 and 1.
