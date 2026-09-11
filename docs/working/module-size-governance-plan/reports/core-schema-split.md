# Worker report — core-schema-split

Brief: `### Brief: core-schema-split`, Phase 5 / 6 completion dispatch,
`docs/working/module-size-governance-plan.md`.

## Outcome

Done.

`packages/fluxiq/src/programs/automation-studio/storage/project/schema.ts`
(931 lines, 21 exported values) is now a one-line facade over a new
`storage/project/schema/` directory of 13 modules plus a barrel. The largest
new file is 428 lines; the largest exported surface is 4 values. No file
outside `storage/project/schema.ts` and `storage/project/schema/**` changed.

## What changed and why

`schema.ts` failed two rules at once: `file-lines` (931 > 800) and
`exported-values` (21 > 15). It held one `AutomationStudioSchemaMigration`
per numbered migration, four table-name catalogues, and one private
statement-builder, `foreignKeyGuards`.

Split by table group, in migration order:

| File | Lines | Exports | Holds |
| --- | --- | --- | --- |
| `domain-resources.ts` | 428 | 1 | 0002, the create-table migration |
| `relation-indexes.ts` | 136 | 1 | 0003, indexes, FTS/r-tree, relation guards |
| `mutations.ts` | 38 | 1 | 0004, idempotent mutation records |
| `event-streams.ts` | 58 | 3 | 0005-0007, spools, cursors, retention |
| `compiled-plans.ts` | 25 | 1 | 0008, compiled plan adoptions |
| `adaptations.ts` | 62 | 1 | 0009, adaptation evidence and audit |
| `ui-query-indexes.ts` | 23 | 1 | 0009 fast-UI covering indexes |
| `routers.ts` | 53 | 3 | 0011-0013, router scaling and detail |
| `flow-settings.ts` | 11 | 1 | 0014, canonical intervention mode |
| `runtime-runs.ts` | 9 | 1 | 0015, run summary envelope |
| `reusable-llm-contexts.ts` | 63 | 3 | 0016-0018, reusable LLM context |
| `table-names.ts` | 52 | 4 | the four table-name catalogues |
| `foreign-key-guards.ts` | 16 | 1 | the shared trigger builder |
| `index.ts` | 15 | — | barrel, explicit named re-exports |

Three decisions worth recording.

**The facade keeps the filename.** `schema.ts` is now
`export * from "./schema/index.ts";`. Both importers —
`storage/project/administration.ts` (`"./schema.ts"`) and
`storage/project/tests/schema.test.ts` (`"../schema.ts"`) — write the explicit
`.ts` extension, which a directory does not satisfy. Keeping the filename kept
the change to zero files outside the brief's scope. This is the same shape as
`model/fixtures.ts` and `model/validation.ts`.

**`foreignKeyGuards` is exported from its module but not from the barrel.**
Nine of the new modules need it, so it has to cross a file boundary; but
re-exporting it through `index.ts` would have widened `schema.ts`'s public
surface, and through `storage/project/index.ts` the package's. `index.ts`
therefore lists the 21 names explicitly rather than using `export *`, and
carries a comment saying why the guards module is absent. The exported-name
diff below is the check that this held.

**Table-name catalogues are grouped, not scattered.**
`AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES` spans tables created by migrations
0002, 0008, 0009, 0011, 0016 and 0017, so it belongs to no single migration
module. All four catalogues sit together in `table-names.ts`.

Imports: each module imports the migration type as
`"../../schema-migrations.ts"` (a file of a directory it lives inside — exempt
under the amended `imports` rule) and `foreignKeyGuards` as
`"./foreign-key-guards.ts"` (same directory — exempt). The `imports` rule
reports nothing for any file in scope.

## Commands run and observed results

All commands run from `F:\!FluxIQ`, package commands from `packages/fluxiq`.

**Exported names, before and after.** Resolved through the TypeScript checker
(`checker.getExportsOfModule`) on `storage/project/schema.ts`, not by grep, so
the facade is compared the way a consumer sees it:

```
$ diff core-schema-exports-before.txt core-schema-exports-after.txt
$ echo $?
0
```

21 names before, 21 after, empty diff. The set is `AUTOMATION_STUDIO_PROJECT_`
plus: `ADAPTATION_EVIDENCE_MIGRATION`,
`COMPILED_RUNTIME_ISOLATION_MIGRATION`, `DOMAIN_RESOURCE_MIGRATION`,
`DOMAIN_TABLES`, `EVENT_CURSOR_MIGRATION`, `FAST_UI_QUERY_INDEX_MIGRATION`,
`INTERVENTION_MODE_MIGRATION`, `MUTATION_MIGRATION`, `MUTATION_TABLES`,
`RELATION_INDEX_MIGRATION`, `RETENTION_MIGRATION`,
`REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION`, `REUSABLE_LLM_CONTEXT_MIGRATION`,
`REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION`,
`ROUTER_RUNTIME_SCALING_MIGRATION`,
`ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION`,
`ROUTER_TARGET_REFERENCE_MIGRATION`, `RUNTIME_SUMMARY_ENVELOPE_MIGRATION`,
`SEARCH_TABLES`, `STREAM_SPOOL_MIGRATION`, `STREAM_SPOOL_TABLES`.
`foreignKeyGuards` is absent from both, as intended.

**SQL text, before and after.** A migration is only correct if every DDL
string survives unaltered, so the staged pre-change blob was compared line for
line against the concatenated new modules, ignoring blank lines, `import`
lines, the added comment lines and the barrel's re-export lines:

```
$ git show :.../storage/project/schema.ts | grep -v '^import ' | grep -v blank | sort > before
$ cat .../schema/*.ts | grep -v '^import ' | grep -v '^//' | grep -v '^export {' | grep -v blank \
    | sed 's/^export function foreignKeyGuards/function foreignKeyGuards/' | sort > after
$ wc -l before after
  916 before
  916 after
$ diff before after && echo "BODY LINES IDENTICAL"
BODY LINES IDENTICAL
```

**Scoped tests.** `npx vitest run src/programs/automation-studio/storage --reporter=basic`

- Before: `Test Files 35 passed (35)`, `Tests 139 passed (139)`, 62.22s.
- After: `Test Files 35 passed (35)`, `Tests 139 passed (139)`, 61.94s.

The narrower
`npx vitest run src/programs/automation-studio/storage/project/tests/schema.test.ts`
was `Tests 8 passed (8)` before the change. This package's storage tree carried
no pre-existing failures, so the before-state was green and stayed green.

**Type check.** `npx tsc --noEmit` over the package was **exit 0 before** this
change. After it, exit 2 — with errors only in another worker's in-flight
tree:

```
src/programs/automation-studio/runtime/llm/harness/provider.ts(2,53): error TS2307: Cannot find module './task-request.ts'
src/programs/automation-studio/runtime/llm/harness/task-kind.ts(2,53): error TS2307: Cannot find module './task-request.ts'
```

A second run minutes later returned a *different* error set in the same
directory (`provider-result.ts(155,38): error TS2304: Cannot find name
'isJsonValue'`), which is what an in-progress concurrent edit looks like.
`grep -c "storage/"` over the error output returned **0** both times.

To get a clean signal for this scope, I type-checked the subtree and both of
its importers under the package's own `tsconfig.base.json` settings, via a
temporary project file that was deleted immediately after:

```
include: schema.ts, schema/**/*.ts, administration.ts, tests/schema.test.ts
$ npx tsc --noEmit -p tsconfig.core-schema-split.json
scoped exit=0
```

**Structure audit.** `git add -N` was run on the 14 new files first, so the
audit's `git ls-files` enumeration could see them.

```
$ node scripts/structure-audit.mjs --rule file-lines --rule exported-values --rule naming --rule directory-files
```

No `file-lines`, `exported-values`, `naming` or `directory-files` finding
names `schema.ts` or any file under `schema/` — the 931-line and 21-value
failures are gone. One advisory warning is new:

```
warn [file-lines] .../storage/project/schema/domain-resources.ts: 428 lines is past the 400-line advisory threshold.
```

```
$ node scripts/structure-audit.mjs --rule imports | grep "storage/project/"
FAIL [imports] .../storage/project/adaptation-store.ts: 1 import(s) ... "../../runtime/compiled-plan.ts"
FAIL [imports] .../storage/project/compiled-plan-store.ts: 1 import(s) ... "../../runtime/compiled-plan.ts"
```

Both pre-existing and outside this brief. Nothing in `schema/` is reported.

The remaining `exported-values` failures under `storage/project/`
(`administration.ts` 6 classes, `database.ts` 2 classes, `ui-cache-store.ts`
3 classes, `migration-cutover.ts` 16 values) are pre-existing and belong to
files the brief forbids touching.

## Not verified

- **`domain-resources.ts` is 428 lines**, past the 400-line *advisory* warn
  though far under the 800-line fail. It is a single migration whose
  `statements` array must be applied in exactly this order; splitting it would
  mean concatenating arrays from several modules to rebuild one migration,
  trading a warning for a correctness hazard. I left it and am flagging the
  judgement rather than burying it. If the supervisor wants the warning gone,
  the honest split is by table family within that one array.
- **Package-wide `pnpm check` / `pnpm test` / `pnpm build` were not run.**
  Three other workers are editing this package concurrently and the harness
  tree does not currently compile, so a package-wide result would measure
  them, not this change. The scoped project-level type check (exit 0) and the
  storage test tree (139 passed) are the isolated evidence.
- **No migration was executed against a fresh database beyond what the storage
  tests already do.** `tests/schema.test.ts` does open a real SQLite project
  and assert every table in `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES` and
  `..._SEARCH_TABLES` exists, and exercises 0014 rollback, so the migration
  list runs end to end — but only over the paths those 8 cases cover.
- **`.structure-baseline.json` was not regenerated** and
  `pnpm structure:baseline` was not run, per the brief. The baseline now holds
  stale keys for `.../storage/project/schema.ts::values` and its line count
  that the supervisor will need to drop.

## Open questions or contradictions found

None. The brief matched what the file actually contained: 931 lines, 21
exported values, both importers writing explicit `.ts` specifiers.

One observation for whoever regenerates the baseline: two migrations share the
`0009` prefix — `0009_adaptation_evidence_revision_safety` and
`0009_fast_ui_query_indexes` — and the numbering then jumps to `0011`. That
duplication predates this work and I changed neither id, but if migration ids
are ever used as keys rather than as labels, it is a latent collision.
