# Report: core-model-files

Phase 5 (`model/fixtures.ts`) and Phase 6 (`model/validation.ts`), both inside
`packages/fluxiq/src/programs/automation-studio/model/`.

## Outcome

Done. Both files are split, both exported-name sets are byte-identical, every
declaration moved verbatim, `tsc --noEmit` is clean, and the model-scoped test
counts are unchanged at 9 files / 56 cases. The structure audit reports the
same three findings for `model` paths before and after — nothing added.

## What changed and why

### The one design decision the brief did not settle

The brief let me own `fixtures.ts` and `validation.ts` and forbade touching
every other file in `model/`. Those two files are imported **by path with an
explicit `.ts` extension**, so turning either into a directory would have
broken four files I was told not to touch:

| Importer | Line | Specifier |
| --- | --- | --- |
| `model/index.ts` | 9, 27 | `./fixtures.ts`, `./validation.ts` |
| `model/composites.ts` | 5 | `./validation.ts` |
| `model/regions.ts` | 3 | `./validation.ts` |
| `nodes/definitions.ts` | 3 | `../model/validation.ts` |

So each subject keeps its filename as a one-line facade over the new
directory, instead of the Phase 2 shape where the parent barrel is repointed:

```ts
// model/fixtures.ts
export * from "./fixtures/index.ts";
// model/validation.ts
export * from "./validation/index.ts";
```

Nothing outside the two directories changed — `git status` shows exactly 18
paths, all of them mine. **Open question for the supervisor** below: when the
held `model/` decision lands, these two facades can collapse into two
specifier edits in `model/index.ts` plus three in the files above.

### Sibling imports go through `../index.ts`, on purpose

This is the trap the `Current State` describes from Phase 1 — a split that
manufactures `imports` findings. Moving code from `model/x.ts` into
`model/x/y.ts` turns every `./flows.ts` into `../flows.ts`, which the
`imports` rule counts as reaching past `model/`'s barrel: a new ratchet key
per file, so eleven new failures for `validation/` and two for `fixtures/`.

The rule exempts a specifier whose basename is `index`, so every extracted
file imports `../index.ts` instead. That is also the dominant existing
convention: 70 files under `automation-studio/` already import
`model/index.ts`, against 8 that reach into its files.

It creates a module cycle (`model/index.ts` → facade → subdirectory →
`../index.ts`). It is benign because no extracted module reads an imported
binding at evaluation time — every use is inside a function body — and
because in barrel order both value dependencies are evaluated before
`validation.ts`: `action-element-target.ts` is line 2 and `regions.ts` is
line 17, against `validation.ts` at line 27. I did not leave that as
reasoning; see "runtime cycle" under validation below.

### `fixtures.ts` (823 lines) → `model/fixtures/`

Split by the document each builder produces. No private helpers existed, so
nothing changed visibility.

| File | Lines | Holds |
| --- | --- | --- |
| `recorded-task.ts` | 387 | `AutomationStudioFixture`, `createAutomationStudioFixture` |
| `flow-expansion.ts` | 198 | `AutomationStudioFlowExpansionFixture`, `createAutomationStudioFlowExpansionFixture` |
| `large-project.ts` | 247 | `AutomationStudioLargeProjectFixture{,Options}`, `createAutomationStudioLargeProjectFixture` |
| `index.ts` | 6 | explicit named re-exports |

`large-project.ts` calls `createAutomationStudioFixture` from
`./recorded-task.ts` — same directory, exempt from the imports rule.

### `validation.ts` (934 lines, 53 declarations) → `model/validation/`

Grouped by the model module that declares the document each function
validates, which is what put `validateEvidenceAnchor` in `state.ts` (model
declares `EvidenceAnchor` in `state.ts`, not `evidence.ts`) and
`validateStateFact`/`validateStateFactReference` in `evidence.ts`.

| File | Lines | Public | Private helpers |
| --- | --- | --- | --- |
| `issue.ts` | 30 | 3 types | `addIssue`, `result` |
| `recording.ts` | 75 | `validateRecordingSession` | `validateTimelineEntry`, `appendElementTargetIssues` |
| `signal-registry.ts` | 26 | `validateSignalRegistry` | — |
| `policy-graph.ts` | 63 | `validatePolicyGraph` | — |
| `condition.ts` | 28 | — | `validateConditionExpression` |
| `state.ts` | 165 | `validateStateSnapshot`, `validateStateVisualFrame`, `validateEvidenceAnchor` | 10 |
| `evidence.ts` | 55 | `validateStateFact`, `validateStateFactReference`, `validateNodeEvidenceBinding` | 2 |
| `node-state.ts` | 55 | 3 `validateNodeState*` | `validateRuntimeComparisonPath` |
| `visual-target.ts` | 21 | `validateActionVisualEntityTarget` | — |
| `flow.ts` | 193 | `validateAutomationStudioFlow` | 10 |
| `adaptation.ts` | 187 | 6 `validateAutomationStudioFlow*`/`*AdaptationPolicy` | 2 |
| `index.ts` | 10 | explicit named re-exports of exactly 23 names | — |

Four helpers had to become exports of their own module because another group
calls them: `addIssue`, `result`, `validateConditionExpression`,
`validateStatePath`. None reaches the public surface — `validation/index.ts`
names the 23 public symbols one by one rather than using `export *`, which is
what keeps the promoted helpers out.

The extraction was mechanical, not retyped: a script sliced each top-level
statement's exact source text and the only edit applied to any declaration was
adding or removing its `export` keyword. A second script re-parses both sides
and compares declaration text — see verification below.

## Commands run and observed results

All commands from `F:\!FluxIQ` or `F:\!FluxIQ\packages\fluxiq`.

**Model-scoped tests — unchanged, the bar the brief set.**

`pnpm exec vitest run src/programs/automation-studio/model`

- Before: `Test Files 9 passed (9)` / `Tests 56 passed (56)`
- After: `Test Files 9 passed (9)` / `Tests 56 passed (56)`

No test file moved. There is no `fixtures.test.ts` or `validation.test.ts`;
the suites that exercise them (`model.test.ts`, `flow-adaptation.test.ts`,
`action-element-target.test.ts`, …) each cover several model subjects, so by
the tests rule they belong to `model/tests/`, where they already are. They
import `../fixtures.ts` and `../validation.ts`, which still resolve, so no
test needed editing either.

**Typecheck.** `pnpm exec tsc --noEmit` → exit 0, no output. This covers the
whole package including `runtime/service.ts`, which imports
`createAutomationStudioFixture` through the barrel.

**Exported-name sets.** A script builds a `tsc` program, resolves each
module's exports through the checker (following alias symbols so a re-export
reports its underlying kind), and prints `kind name` sorted.

`diff exports-before.txt exports-after.txt` → **no output, exit 0.**

- `model/fixtures.ts`: 7 names, unchanged —
  `createAutomationStudioFixture`, `createAutomationStudioFlowExpansionFixture`,
  `createAutomationStudioLargeProjectFixture` (functions);
  `AutomationStudioFixture`, `AutomationStudioFlowExpansionFixture`,
  `AutomationStudioLargeProjectFixture`,
  `AutomationStudioLargeProjectFixtureOptions` (types).
- `model/validation.ts`: 23 names, unchanged — 20 `validate*` functions plus
  `AutomationStudioValidationIssue`, `AutomationStudioValidationResult`,
  `AutomationStudioValidationSeverity`.

`model/index.ts` is unmodified (`git status` confirms) and resolves 263
exports; since it re-exports both subjects with `export *` and both surfaces
are proven identical, the barrel's 63 external consumers see no change.

**Declarations moved verbatim.** A script re-parses the pre-split originals
and every new file, strips only a leading `export `, normalises CRLF, and
compares text:

- `fixtures`: `7 original declarations, 7 moved, 0 mismatches`
- `validation`: `53 original declarations, 53 moved, 0 mismatches`

**Structure audit.** `node scripts/structure-audit.mjs --json`, filtered to
`automation-studio/model` paths. Identical before and after — `ADDED: (none)`,
`REMOVED: (none)`:

```
warn exported-values 9/8 apps/web/.../model/project-summary-converters.ts::values
warn exported-values 9/8 packages/fluxiq/.../model/flows.ts::values
warn file-lines 409/400 packages/fluxiq/.../model/flow-adaptation.ts
```

All three predate this work and belong to files I do not own. Specifically: no
new `imports`, `naming`, `directory-files`, `file-lines` or `exported-values`
finding anywhere in `model/`. The new files are staged, so `git ls-files` —
which is how the audit builds its file universe — does see them; confirmed by
`git ls-files .../model/validation/state.ts` returning the path.

Three baseline entries are now lowerable to nothing and will drop when you
regenerate (I did not run `pnpm structure:baseline`):

| Baseline key | Was | Now |
| --- | --- | --- |
| `file-lines` `model/fixtures.ts` | 823 | 1 |
| `file-lines` `model/validation.ts` | 934 | 1 |
| `exported-values` `model/validation.ts::values` | 28 | 0 |

`model/` itself stays at 28 direct source files, its baseline value, because
both facades remain. Largest new file is 387 lines, under the 400-line warn
threshold.

**Runtime cycle, exercised rather than argued.** The brief says `fixtures.ts`
has zero importers, which is true of the *file specifier* — but its symbols
have many runtime consumers through the barrel, including production code at
`runtime/service.ts:13`. So I ran the consumers I could reach without
colliding with another worker:

`pnpm exec vitest run` over `nodes`, `dsl`, `client-gateway`,
`fingerprinting`, `testing`, plus `runtime/tests/router-runtime.test.ts` and
`storage/tests/memory-repository.test.ts` (the two suites outside `model`
that call fixture builders through `model/index.ts`):

`Test Files 12 passed (12)` / `Tests 53 passed (53)`

I also ran a temporary probe inside `model/tests/` that imports all three
fixture builders and three validators from the package entry
`fluxiq/automation-studio` and calls them — the deepest entry into the cycle —
`Test Files 1 passed (1)` / `Tests 1 passed (1)`. **The probe file was deleted
after the run**; `git status` shows only the 18 intended paths.

That run emitted a burst of `Sourcemap for ".../packages/fluxiq/dist/programs/automation-studio/storage/project-*.js" points to missing source files`.
Those are the `storage/project-*` and `runtime/llm-*` names the Phase 2 and
Phase 3 workers are moving right now, in a stale `dist`. Not mine, and
warnings only — the run passed.

## Not verified

- **The full `packages/fluxiq` suite, and the four known pre-existing
  failures.** The brief scoped me to `model` and eleven workers are live in
  `runtime/`, `storage/` and `api/`, so a full run would have mixed their
  in-flight state into my result. `service.test.ts` — one of the four — is the
  only caller of `createAutomationStudioLargeProjectFixture` inside this
  package; I covered that builder with the probe instead.
- **`apps/web`.** `apps/web/src/features/automation-studio/testing/tests/phase8-fixture-integrity-contract.test.ts`
  imports `createAutomationStudioLargeProjectFixture` from
  `fluxiq/automation-studio` and asserts on fixture integrity. It typechecks
  and the probe proves the same import path resolves and runs, but I did not
  run that suite — `apps/web` is where concurrent `dist` rebuilds produce
  spurious collection failures.
- **`pnpm build`.** Not run. `packages/fluxiq/dist` is being rebuilt by other
  workers; `tsc --noEmit` is clean, but the declaration-rewrite step
  (`scripts/rewrite-declaration-imports.mjs dist`) has not been exercised
  against the new nested directories.
- **`pnpm check` end to end.** Only `scripts/structure-audit.mjs` was run
  directly; `pnpm structure:test` and `pnpm -r check` were not.
- Line endings: new files mix LF headers with CRLF bodies, matching the
  working tree's existing state (`core.autocrlf=true`, and e.g. `flows.ts`
  already has 311 CRLF among 352 newlines). Git normalises to LF on commit, so
  I left it; I did not confirm the committed blobs.

## Open questions or contradictions found

1. **The facades are a consequence of the must-not-touch boundary, not a
   preference.** `model/fixtures.ts` and `model/validation.ts` now exist only
   to forward to their directories. Phase 2's shape — parent barrel repoints
   at `./project/index.ts` — would have been cleaner, but it needs four edits
   in files the brief reserved for your held `model/` decision. When that
   lands, deleting both facades costs five specifier edits: `model/index.ts`
   lines 9 and 27, `model/composites.ts:5`, `model/regions.ts:3`,
   `nodes/definitions.ts:3`. Everything else stays put.
2. **"`fixtures.ts` has zero importers" is true by path and misleading in
   effect.** No file imports the specifier `model/fixtures.ts` outside
   `model/`, but its symbols reach `runtime/service.ts` (production, not a
   test), `runtime/tests/router-runtime.test.ts`,
   `runtime/tests/service.test.ts`, `storage/tests/memory-repository.test.ts`
   and an `apps/web` contract test through the barrel. The split survived
   that, but "the safest split in the plan" rests on the barrel's export list
   being identical, not on there being no consumers.
3. **The `imports` rule makes "extract into a subdirectory" cost a decision
   every Phase 5/6 worker faces, and answers it the same way each time.**
   Any file moved from `dir/x.ts` to `dir/x/y.ts` must import its former
   siblings through `../index.ts` or take a new ratchet key. For reference, I
   observed the in-flight `storage/project/` split reaching for
   `../schema-migrations.ts` and `../paging.ts`, which the rule counts. If
   that pattern is intended to be allowed, the rule needs the same kind of
   exemption Phase 1 added for `tests/`; if not, those imports need
   repointing. Worth one line in `Current State` either way, since Phases 5
   and 6 will keep producing this shape.
4. **`validation/issue.ts` exports `result`,** a name generic enough to be
   worth renaming — but it was a private helper in the original and the
   dispatch forbids renaming symbols, so I left it. If you want it renamed
   (`toValidationResult`, say), it is private to `validation/` and the change
   is contained.
