# Report: core-runtime-split (Phase 3a)

## Outcome

Done.

`packages/fluxiq/src/programs/automation-studio/runtime/` is split. The eight
`llm-*` modules are now `runtime/llm/` with the prefix stripped; the three
`flow-bootstrap*` modules are now `runtime/flow-bootstrap/`. Each moved file's
test moved with it. `runtime/index.ts` publishes the same 276 symbols it
published before, proved by a checker-resolved diff. The four external imports
that reached into `runtime/` internals now go through the barrel, and
`api/handlers.ts` is at 2,091 lines — under its frozen 2,094 ceiling.

## What changed and why

### Moves (all `git mv`, no exported symbol renamed)

`runtime/llm/` — 8 source files, prefix `llm-` stripped:

| Before | After |
| --- | --- |
| `llm-deepseek-provider.ts` | `llm/deepseek-provider.ts` |
| `llm-evidence-loop.ts` | `llm/evidence-loop.ts` |
| `llm-execution-grants.ts` | `llm/execution-grants.ts` |
| `llm-harness.ts` | `llm/harness.ts` |
| `llm-provider-contract.ts` | `llm/provider-contract.ts` |
| `llm-provider-factories.ts` | `llm/provider-factories.ts` |
| `llm-run-budget.ts` | `llm/run-budget.ts` |
| `llm-token-estimation.ts` | `llm/token-estimation.ts` |

`runtime/flow-bootstrap/` — 3 source files, prefix `flow-bootstrap-` stripped:

| Before | After |
| --- | --- |
| `flow-bootstrap-adaptation.ts` | `flow-bootstrap/adaptation.ts` |
| `flow-bootstrap-generation-failure.ts` | `flow-bootstrap/generation-failure.ts` |
| `flow-bootstrap.ts` | `flow-bootstrap/plan.ts` |

**Why `flow-bootstrap/` and not `flow/`.** The naming rule computes a group's
prefix as everything before the *first* hyphen, so it reported the group as
`runtime::flow` (3 members — the bare `flow-bootstrap.ts` counts, because its
own prefix is also `flow`) and its message suggested `runtime/flow/`. Taking
that literally produces `flow/bootstrap.ts`, `flow/bootstrap-adaptation.ts`,
`flow/bootstrap-generation-failure.ts` — a fresh 3-member `bootstrap-` group
inside the new directory, the same violation one level down. `flow-bootstrap/`
with the full prefix stripped leaves `adaptation`, `generation-failure` and the
bare file, which share nothing. The bare `flow-bootstrap.ts` has no suffix to
keep, so it is named for what it holds: the bootstrap plan contract, its JSON
schemas, `parseAutomationStudioFlowBootstrapPlan` and
`validateAutomationStudioFlowBootstrapPlan` — `plan.ts`. Nothing in `model/`'s
Phase 3b was touched, but the same bare-file question will arise there for
`state.ts`.

### Tests (8 moved, 4 deliberately left)

To `llm/tests/`: `deepseek-provider`, `evidence-loop`, `evidence-loop-provider`,
`execution-grants`, `harness`, `run-budget`. To `flow-bootstrap/tests/`:
`plan` (was `flow-bootstrap.test.ts`), `generation-failure`.

Four tests stayed in `runtime/tests/` because their subject spans both new
directories, and `runtime/` is the nearest directory containing both:
`flow-bootstrap-harness.test.ts` (harness x bootstrap),
`llm-deepseek-flow-bootstrap.test.ts` (provider x bootstrap), and the
`service-flow-bootstrap-adaptation` / `service-flow-bootstrap-generation` pair,
whose subject is `service.ts`.

`llm/tests/evidence-loop-provider.test.ts` is a judgement call in the other
direction: it asserts on the harness, the evidence loop and the DeepSeek
provider — all in `llm/` — and only *reads* two `flow-bootstrap` schema
constants as fixture data, so it moved with its subjects.

### Barrels

`llm/index.ts` and `flow-bootstrap/index.ts` reproduce exactly the export lines
`runtime/index.ts` previously carried for those modules, including the four
named DeepSeek exports (not `export *`). `runtime/index.ts` now re-exports
`./flow-bootstrap/index.ts` and `./llm/index.ts` in the positions the replaced
lines occupied, and falls from 32 lines to 19.

`llm/token-estimation.ts` is **not** exported from `llm/index.ts`, because
`runtime/index.ts` never exported it and the brief forbids widening a barrel.
That is the whole source of the new barrel-skipping imports listed below.

### The four external importers

All four are in one file,
`packages/fluxiq/src/programs/automation-studio/api/handlers.ts`, at lines
88-91 of the pre-change file. It was the only file outside `runtime/` with four
such imports, and the only external file that referenced anything I moved:

| Line | Was | Symbol(s) | Now |
| --- | --- | --- | --- |
| 88 | `../runtime/service.ts` | `AutomationStudioService` | `../runtime/index.ts` |
| 89 | `../runtime/flow-bootstrap-generation-failure.ts` | `parseAutomationStudioFlowBootstrapGenerationError` | `../runtime/index.ts` |
| 90 | `../runtime/llm-execution-grants.ts` | `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS`, `AutomationStudioLlmExecutionGrantService` | `../runtime/index.ts` |
| 91 | `../runtime/router-runtime.ts` | `evaluateAutomationStudioRouteCondition` | `../runtime/index.ts` |

Every symbol was already on the barrel, so all four went to the barrel and none
needed a deep path. `api/handlers.ts` drops from 4 barrel-skipping imports to 0.

**Written as one line, on the coordinator's instruction.** My first version was
a six-name braced block, which took the file from 2,094 to 2,097 — and 2,094 is
its frozen `file-lines` baseline, which `min(previous, current)` cannot absorb.
The single-line form takes it to **2,091 lines** (verified: `wc -l` and the
`file-lines` rule both report 2,091), three under the ceiling, so the baseline
ratchets down rather than merely holding.

For the record, twelve *other* imports from outside `runtime/` reach into it —
`client-gateway/bridge.ts` (2), `client-gateway/tests/bridge.test.ts`,
`api/tests/handlers.test.ts`, `dsl/compiler.ts`, `model/runtime.ts`,
`storage/file-store.ts` (2), `storage/project/adaptation-store.ts`,
`storage/project/compiled-plan-store.ts` (2) — but none touches a file I moved,
and `model/**` and `storage/**` are outside what I own.

### The three storage imports broken by `core-storage-split`

These were already fixed before the coordinator's second message arrived;
`tsc --noEmit` had caught them on the untouched tree at the start of this task.
All three live in `runtime/**`, so they were mine to repair:

| File | Was | Now |
| --- | --- | --- |
| `runtime/reusable-llm-context.ts:2` | `../storage/project-reusable-llm-context-store.ts` | `../storage/index.ts` |
| `runtime/tests/reusable-llm-context.test.ts:2` | `../../storage/project-reusable-llm-context-store.ts` | `../../storage/index.ts` |
| `runtime/tests/service.test.ts:16` | `../../storage/project-graph-store.ts` | `../../storage/index.ts` |

**I chose the barrel in all three cases, not the deep path.** Both symbols are
on it: `storage/index.ts` has `export * from "./project/index.ts"`, and
`storage/project/index.ts` has `export * from "./graph-store.ts"` and
`export * from "./reusable-llm-context-store.ts"` — I read the directory to
confirm the stripped filenames rather than assuming the transformation. Using
the barrel also removes three barrel-skipping imports instead of relocating
them. No file under `storage/**` was edited.

`service.test.ts` then had two separate imports from `../../storage/index.ts`
(the pre-existing barrel import on line 15 and the one I had just repointed on
line 16), so I merged them into one — the file falls 4,790 -> 4,789.

I also tried the same merge on `flow-bootstrap/generation-failure.ts`, which
has two `import type` statements from `../llm/index.ts`. Merging a single-line
import into a braced block *added* a line, 502 -> 503, so I reverted it and left
the two statements. A rise is a rise even on a file whose finding is only a
warning, and the tidiness was not worth the risk.

## Commands run and observed results

### Barrel surface — primary evidence

TypeScript's own checker, `getExportsOfModule` on `runtime/index.ts` resolved
through `packages/fluxiq/tsconfig.json`, names sorted:

```
$ node <scratch>/runtime-split-exports.mjs   # before: count: 276
$ node <scratch>/runtime-split-exports.mjs   # after:  count: 276
$ diff runtime-split-exports-before.txt runtime-split-exports-final.txt
(no output)
IDENTICAL: 276 symbols
```

Empty diff, re-checked after the final edits. Symbol names, not source lines,
so a re-export through a new subdirectory barrel cannot hide a change.

### Type check

```
$ npx tsc --noEmit            # before, on the tree as I received it
src/programs/automation-studio/runtime/reusable-llm-context.ts(2,63): error TS2307: Cannot find module '../storage/project-reusable-llm-context-store.ts' ...
src/programs/automation-studio/runtime/tests/reusable-llm-context.test.ts(2,63): error TS2307: ...
src/programs/automation-studio/runtime/tests/service.test.ts(16,56): error TS2307: Cannot find module '../../storage/project-graph-store.ts' ...
exit=2

$ npx tsc --noEmit            # after
exit=0

$ npx tsc --noEmit            # re-run once core-storage-split had finished
exit=0
```

Clean, and re-confirmed on the post-storage tree as the coordinator asked.

### Scoped tests

`npx vitest run --passWithNoTests src/programs/automation-studio/runtime`, three
full runs:

| Run | Test Files | Tests | Failed |
| --- | --- | --- | --- |
| before | 2 failed, 30 passed (32) | 400 | 4 |
| after | 2 failed, 30 passed (32) | 400 | 4 |
| after, post-storage (final) | 2 failed, 30 passed (32) | 400 | 3 |

File count and test count are identical in all three: **32 files, 400 tests**.
The first two runs produced the identical four-failure baseline list. The final
run produced three of those four — a strict subset, never a new failure.

Baseline list (from the `before` run):

- `tests/service-subflow-pagination.test.ts > bounds concurrent detail hydration when a legacy subflow index must be migrated`
- `tests/service-subflow-pagination.test.ts > does not hydrate a stale legacy index when a typed SQL filter has zero matches`
- `tests/service.test.ts > approves edited recording Flow proposal graphs into Flows`
- `tests/service.test.ts > turns mapped observations into reviewed Flow actions without making action inputs policy state`

**`service-subflow-pagination.test.ts` is flaky, which refines a claim in
`Current State`.** Running that file alone, twice in a row:

```
### run 1
      Tests  1 failed | 4 passed (5)
 FAIL  ... > bounds concurrent detail hydration when a legacy subflow index must be migrated
### run 2
      Tests  5 passed (5)
```

Two of its five tests fail under full-suite load, one fails in isolation, and
zero fail on a second isolated run. `Current State` lists this file among
"nine genuine test failures … none is a path-resolution artifact" — true, it is
not a path artifact, but at least two of those four failures are load- or
timing-dependent rather than deterministic. The two `service.test.ts` failures
reproduced in all three full runs and look deterministic.

### Structure audit

`node scripts/structure-audit.mjs --json` reports only findings *not* covered by
the baseline, so I ran every rule raw through the same `createContext()` and
filtered to my paths. `pnpm structure:baseline` was **not** run.

`directory-files` (limit 25 fail / 15 warn):

| Directory | Before | After |
| --- | --- | --- |
| `runtime` | 34 (fail) | 23 (warn) |
| `runtime/tests` | 32 (fail) | 24 (warn) |
| `runtime/llm` | — | 9 (no finding) |
| `runtime/llm/tests` | — | 6 (no finding) |
| `runtime/flow-bootstrap` | — | 4 (no finding) |
| `runtime/flow-bootstrap/tests` | — | 2 (no finding) |

Both baseline entries are lowerable; neither rose. The two that remain are
advisory warnings, which never ratchet.

`naming`: `runtime::flow` (3/3) and `runtime::llm` (8/3) are both **gone**; no
`naming` finding of any kind remains under `runtime/`. No new depth finding —
`runtime/llm/deepseek-provider.ts` is 8 path segments, exactly the limit, and
tests are exempt from depth.

`file-lines`: no file in my scope rose. `api/handlers.ts` 2,094 -> 2,091,
`runtime/tests/service.test.ts` 4,790 -> 4,789, `runtime/index.ts` 32 -> 19,
and every one of the 19 moved files is byte-for-byte the same length as its
pre-move counterpart (checked file by file against `git show HEAD:`).

`imports`, restricted to `runtime/**` plus `api/handlers.ts`: 23 skips across
16 importer files before, 18 skips across 16 files after.

Removed by me: `api/handlers.ts` 4 -> 0, `tests/service.test.ts` 1 -> 0,
`tests/reusable-llm-context.test.ts` 1 -> 0.

Added by me — five, four of them the same cause, `llm/token-estimation.ts`
being unexported on purpose:

| Importer | Specifier |
| --- | --- |
| `runtime/flow-bootstrap/plan.ts` | `../llm/token-estimation.ts` |
| `runtime/flow-bootstrap/tests/plan.test.ts` | `../../llm/token-estimation.ts` |
| `runtime/reusable-llm-context.ts` | `./llm/token-estimation.ts` |
| `runtime/tests/llm-deepseek-flow-bootstrap.test.ts` | `../llm/token-estimation.ts` |
| `runtime/llm/harness.ts` | `../reusable-llm-context.ts` |

Three other rows moved without my touching them — `runtime/service.ts` 2 -> 1
and the two tests importing `../../api/contracts.ts` 2 -> 1 — because the
concurrent `core-api-contracts` worker turned `api/contracts.ts` into a
directory, which the rule exempts. Not mine; do not credit them to this brief.

### Permissive re-sweep for stale references

On the coordinator's instruction — because the brief's original count came from
a regex that could not match a specifier ending in `.ts` — I re-grepped with a
pattern that allows any trailing characters, not a closing quote:

```
$ grep -rnE "runtime/llm-[a-zA-Z0-9_.-]+|runtime/flow-bootstrap[a-zA-Z0-9_.-]*|(\.|\.\.)/llm-[a-zA-Z0-9_.-]+|(\.|\.\.)/flow-bootstrap[a-zA-Z0-9_.-]*" \
    --include=*.ts --include=*.tsx --include=*.mjs --include=*.js --include=*.cjs .
```

**No importer beyond the four exists.** Every hit in a code file is a *new*
`flow-bootstrap/index.ts` path, matched because the regex also matches the new
directory name. Zero references to the old flat filenames remain in any `.ts`,
`.tsx`, `.mjs`, `.js` or `.cjs` file in either repository.

I also swept the downstream repository (`F:\!FluxIQWebExtension`, in `apps/`,
`domain/`, `packages/`). Every hit there is the wire endpoint string
`generate-flow-bootstrap-adaptation` or a contract version such as
`automation-studio.flow-bootstrap-failure.v1` — protocol identifiers, not file
paths — plus `domain/.script-build/` build output. Nothing downstream names a
moved file. Downstream consumes `fluxiq` through package exports, not relative
paths, so there was no importer to find.

Non-code references to the old paths do remain, none of which I own:

| Where | What | Who should handle it |
| --- | --- | --- |
| `.structure-baseline.json` | old `file-lines` / `imports` keys | supervisor — my brief forbids touching it |
| `docs/reference/framework-reference.md`, `packages/fluxiq/docs/reference/framework-reference.md` | ~90 generated `file:line` citations | regenerate through the owning script; never hand-edit |
| `apps/web/.e2e-host/.fluxiq/cache/docs/reference/framework-reference.md` | same, under `.fluxiq/cache/` | generated cache, never committed |
| `docs/working/llm-assisted-deterministic-automation-expansion-plan.md` | ledger entries quoting commands as they ran | historical record — should **not** be rewritten |
| **`docs/architecture/automation-studio/llm-flow-bootstrap.md` lines 5 and 131** | **authored prose naming `runtime/flow-bootstrap.ts` and `runtime/flow-bootstrap-adaptation.ts`** | **see below** |

That last one is the only *authored* documentation my change made stale. Line 5
reads "in `runtime/flow-bootstrap.ts`" and line 131 "The
runtime/flow-bootstrap-adaptation.ts module defines…"; they now want
`runtime/flow-bootstrap/plan.ts` and `runtime/flow-bootstrap/adaptation.ts`.
It is a two-word fix, but `docs/architecture/**` is outside the paths my brief
gives me, so I left it and am naming it here rather than editing something I do
not own while other workers are running.

## Not verified

- **No full `pnpm check`, `pnpm test` or `pnpm build`.** Several workers were
  editing this repository at the same time, so a repository-wide run would have
  mixed their state into my result. Everything above is scoped to
  `packages/fluxiq` (type check) or to `src/programs/automation-studio/runtime`
  (tests).
- **The audit numbers are a snapshot of a moving tree.** `storage/**` and
  `api/**` changed under me while I worked. I re-derived before and after from
  the same rule code both times and attributed only rows I can trace to my own
  edits, but the supervisor should re-run the audit once every worker lands.
- **`packages/fluxiq/dist/` is stale.** It is untracked build output and still
  carries the old `runtime/llm-*.d.ts` layout. Nothing rebuilt it; `pnpm build`
  will.
- **No downstream build or type-check.** I grepped `F:\!FluxIQWebExtension` for
  stale references and found none, but I did not build or type-check it. The
  public surface is the same 276 symbols, so no downstream break is expected —
  unproven, though.
- **I did not root-cause the pagination flakiness**, only demonstrated it. Two
  isolated runs of the same file gave different results; I did not determine
  what makes it load-sensitive.
- **No live or browser validation** — not applicable to this change.

## Open questions or contradictions found

1. **The plan's `flow-bootstrap*` grouping and the naming rule's own message
   disagree.** Phase 3 says `flow-bootstrap*` -> `flow-bootstrap/`; the rule
   reports the group as `flow` and tells you to create `runtime/flow/`.
   Following the rule's message creates a nested `bootstrap-` group — the rule
   would fire again on the directory it just told you to create. I followed the
   plan. Worth a line in the plan so Phase 3b's bare `state.ts` does not hit the
   same surprise, and worth considering whether `prefixGroupFindings` should
   suggest the longest shared prefix rather than the first segment.

2. **`llm/token-estimation.ts` is the one unresolved tension.** Four modules
   need it and it is deliberately absent from the public surface, so every
   cross-directory use of it is a barrel skip. Three ways out, none of which I
   took: export it from `llm/index.ts` (widens `runtime/index.ts` by two
   symbols — the brief forbids it); leave it in `runtime/` as
   `token-estimation.ts` (contradicts "the 8 `llm-*` files move", and only
   trades five new skips for four); or accept the five. I accepted the five and
   am flagging it.

3. **Phase 3's optional normalization would pay for itself.** Moving
   `reusable-llm-context.ts` -> `llm/reusable-context.ts` and
   `completed-llm-evidence.ts` -> `llm/completed-evidence.ts` — explicitly
   optional in the plan and not in my brief, so not done — would remove two of
   the five new skips (`llm/harness.ts` and `runtime/reusable-llm-context.ts`)
   and bring `runtime/` to 21 loose files. Both are `export *`-ed from
   `runtime/index.ts` today, so the surface would survive the move unchanged.

4. **Briefs partitioned by file still collided.** `core-storage-split` moved
   `storage/project-*.ts`; the imports naming those files live in `runtime/**`,
   and `storage/**` is on my "must not touch" list, so neither of us owned the
   fix and the tree was red between us until I repaired my side. Partitioning by
   file does not partition the import graph. A brief that moves files should say
   who repairs the importers living in someone else's directory — and the same
   gap left `docs/architecture/automation-studio/llm-flow-bootstrap.md` stale,
   since documentation ownership was not assigned either.

5. **A line-count ceiling can be tripped by an import style, not by new code.**
   Collapsing four imports into one braced block added three lines to a file
   already frozen at its exact length, which `min(previous, current)` treats as
   a hard failure. Any worker that rewrites imports in a baselined file needs to
   check `wc -l` before and after, not just that the imports resolve. Worth a
   line in the shared context of future dispatches.
