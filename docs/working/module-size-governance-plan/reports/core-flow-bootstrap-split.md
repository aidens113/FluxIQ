# core-flow-bootstrap-split

Worker report — Migration Plan Phase 6, `runtime/flow-bootstrap/plan.ts`.

## Outcome

Done.

`packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan.ts`
went from 958 lines to 31. Its 20 exported names are unchanged, the
`flow-bootstrap` barrel's 40 exported names are unchanged, the scoped test run
is unchanged at 2 files / 42 cases, and `tsc --noEmit` over `packages/fluxiq`
still exits 0. No new `imports`-rule key was manufactured; `plan.ts`'s existing
one fell from 2 barrel-skipping imports to 1.

## What changed and why

The plan's Phase 6 entry calls this module mixed and says to split its types out
first, then its bodies. It held, in one file: two limit tables, eleven exported
types, two JSON Schemas, catalog construction with its own ranking engine,
structural parsing, registry validation with layout and risk derivation, and a
floor of shared issue/JSON helpers.

`plan.ts` is now a facade over a new `plan/` directory, thirteen modules:

| Module | Lines | Holds |
| --- | --- | --- |
| `limits.ts` | 32 | Both limit tables |
| `contracts.ts` | 96 | All eleven exported types |
| `output-schema.ts` | 100 | The canonical `$defs`-based output schema |
| `evidence-schema.ts` | 116 | The reference-free evidence schema, its private sub-schema builders, and the evidence limit check |
| `catalog.ts` | 86 | `buildAutomationStudioFlowBootstrapContext` and the private `compactDefinition` |
| `ranking.ts` | 111 | Intent equivalents, stop words, and the definition scorer |
| `parsing.ts` | 117 | `parseAutomationStudioFlowBootstrapPlan` and its private per-node parsers |
| `validation.ts` | 248 | `validateAutomationStudioFlowBootstrapPlan` and its private registry, port, parameter, connectivity and depth checks |
| `layout.ts` | 39 | Deterministic node placement |
| `risk.ts` | 16 | Risk band derivation |
| `issues.ts` | 26 | `error` plus the field-level emitters (`rejectFields`, `symbolic`, `identifier`, `boundedText`) |
| `json-guards.ts` | 27 | `isRecord`, `isJsonValue`, `isJsonObject`, `safeByteLength` |
| `index.ts` | 14 | Barrel |

Nothing was rewritten. Every body was moved verbatim; the only edits are the
header comment on each file, the import lines, and an `export` keyword on the
helpers that now cross a module boundary (`error`, `rejectFields`, `symbolic`,
`identifier`, `boundedText`, `isRecord`, `isJsonValue`, `isJsonObject`,
`safeByteLength`, `layoutNodes`, `deriveRisk`, `rankBootstrapDefinitions`).
Verified mechanically: see "Content equivalence" below.

### Two decisions worth keeping

**`plan/index.ts` re-exports seven of the thirteen modules, not all of them.**
`issues.ts`, `json-guards.ts`, `layout.ts`, `ranking.ts` and `risk.ts` export
helpers only so their siblings can import them. Re-exporting them would widen
the program's public surface, because `flow-bootstrap/index.ts` does
`export * from "./plan.ts"` and the automation-studio barrel carries that
upward. The barrel's comment says so, so a later `export *` sweep does not
quietly undo it.

**`automationStudioFlowBootstrapCatalogByteBudget` stays declared in `plan.ts`
rather than moving under `plan/`.** It is the only member that calls
`automationStudioLlmTokenBudgetBytes`, and `runtime/llm/index.ts` deliberately
does not publish `token-estimation.ts` (the `core-harness-split` brief pins that
decision). Moving that import into a new file under `plan/` would have created a
fresh `imports`-rule key with no baseline record, which the ratchet fails
outright — the trap the brief flagged. Holding the import at the `plan.ts` level
keeps it on a key that already exists and leaves every module under `plan/`
reaching outside its own directory only through `nodes/index.ts` and
`core/index.ts`. `plan.ts` carries that reasoning in its header comment.

The type-only `../../nodes/contracts.ts` import *was* routed through
`nodes/index.ts`, as the brief instructed; that is why `plan.ts`'s skip count
dropped from 2 to 1.

## Commands run and observed results

All commands run from `F:\!FluxIQ\packages\fluxiq` unless noted.

**Typecheck — before and after, both exit 0.**

```
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Before: `exit=0`, zero output. After: `exit=0`, zero output. The package was
already clean when I started despite three other workers editing `service.ts`,
`runtime/llm/harness.ts` and `api/handlers.ts` in the same tree, and it is still
clean now.

**Unused imports — none introduced.**

```
./node_modules/.bin/tsc --noEmit --noUnusedLocals -p tsconfig.json | grep flow-bootstrap
```

No output: no unused import or local in any file under `flow-bootstrap/`.

**Scoped tests — unchanged in file and case counts.**

```
./node_modules/.bin/vitest run src/programs/automation-studio/runtime/flow-bootstrap
```

Before: `Test Files 2 passed (2)`, `Tests 42 passed (42)`
(`tests/generation-failure.test.ts` 21, `tests/plan.test.ts` 21).
After: identical — `Test Files 2 passed (2)`, `Tests 42 passed (42)`.

`tests/plan.test.ts` was not edited. It imports the nine public members it
already imported, from `../plan.ts`, and still resolves them.

**Downstream consumers of the barrel — run as an extra check, not required by
the brief.**

```
./node_modules/.bin/vitest run \
  src/programs/automation-studio/runtime/tests/service-flow-bootstrap-generation.test.ts \
  src/programs/automation-studio/runtime/tests/service-flow-bootstrap-adaptation.test.ts \
  src/programs/automation-studio/runtime/tests/llm-deepseek-flow-bootstrap.test.ts
```

`Test Files 3 passed (3)`, `Tests 56 passed (56)`.

**Exported-name diff — identical, both for the module and for the directory
barrel.** Enumerated with the TypeScript checker
(`checker.getExportsOfModule`), which resolves `export *` chains, so this
compares real module surfaces rather than source text.

```
diff <plan.ts before> <plan.ts after>       -> no differences, 20 names
diff <index.ts before> <index.ts after>     -> no differences, 40 names
```

The 20 names on `plan.ts`:

```
AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA
AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS
AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS
AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA
AutomationStudioFlowBootstrapCatalogEntry
AutomationStudioFlowBootstrapContext
AutomationStudioFlowBootstrapEdge
AutomationStudioFlowBootstrapIssue
AutomationStudioFlowBootstrapNode
AutomationStudioFlowBootstrapPlan
AutomationStudioFlowBootstrapRisk
AutomationStudioFlowBootstrapRouter
AutomationStudioFlowBootstrapSubflow
AutomationStudioFlowBuildPlan
AutomationStudioValidatedFlowBootstrapPlan
automationStudioFlowBootstrapCatalogByteBudget
buildAutomationStudioFlowBootstrapContext
isAutomationStudioEvidenceFlowBootstrapResultWithinLimits
parseAutomationStudioFlowBootstrapPlan
validateAutomationStudioFlowBootstrapPlan
```

**Content equivalence — no line lost, none duplicated.** Every non-blank line of
the original body (lines 9–958, i.e. everything after its import block), with a
leading `export ` stripped, sorted; against the same treatment of `plan.ts` plus
all thirteen new files with my added imports and header comments filtered out:

```
diff <original body, sorted> <new bodies, sorted>
```

The diff contains no `<` lines at all — nothing from the original is missing —
and its only `>` lines are the 54 header-comment lines I wrote and the two
continuation lines of `plan.ts`'s new multi-line import. Since `sort` preserves
multiplicity, the absence of extra `>` body lines also rules out a body being
copied into two files.

**Structure audit.** New files were registered with
`git add -N packages/.../flow-bootstrap/plan` first, because the audit
enumerates through `git ls-files` and is blind to untracked files. Then, from
`F:\!FluxIQ`:

```
node scripts/structure-audit.mjs --json
node scripts/structure-audit.mjs --rule file-lines --json
```

Findings whose key mentions `flow-bootstrap`, after:

- failures (3): `flow-bootstrap/plan.ts` imports = 1;
  `flow-bootstrap/tests/plan.test.ts` imports = 1;
  `runtime/tests/llm-deepseek-flow-bootstrap.test.ts` imports = 1.
- warnings (3): `generation-failure.ts` 502 lines, `tests/plan.test.ts` 421
  lines, `runtime/tests/service-flow-bootstrap-adaptation.test.ts` 481 lines —
  all pre-existing, all on files I do not own.
- `file-lines` failures in scope: none.

Before, the same filter gave: `flow-bootstrap/plan.ts` imports = **2**,
`flow-bootstrap/tests/plan.test.ts` imports = 1,
`runtime/tests/llm-deepseek-flow-bootstrap.test.ts` imports = 1 — plus a
`file-lines` failure on `flow-bootstrap/plan.ts` at 958. That last one is gone.

Note for the supervisor regenerating the baseline: `.structure-baseline.json`
still keys these by the **pre-Phase-3** path `runtime/flow-bootstrap.ts` (958
under `file-lines`, 1 under `imports`). It has no key at all for
`runtime/flow-bootstrap/plan.ts`, which is why both findings were failing
outright rather than being suppressed. `pnpm structure:baseline` will record
`imports: runtime/flow-bootstrap/plan.ts = 1` and drop the stale
`runtime/flow-bootstrap.ts` entries. I did not run it, per the brief.

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` repository-wide.** Not run. Three
  other workers were editing `runtime/service.ts`, `runtime/llm/harness.ts` and
  `api/handlers.ts` in this same tree while I worked, so a repository-wide run
  would not have attributed cleanly. I scoped every command to
  `runtime/flow-bootstrap` or to the whole-package typecheck, which was green
  both before and after.
- **The repository-wide audit failure count.** It stood at 33 after my change. I
  did not capture it before starting, so I can only account for my own scope,
  which is net one failure fewer (the `file-lines` failure on the 958-line
  `plan.ts`) and no new keys.
- **Runtime behaviour beyond the tests named above.** Nothing was rewritten, and
  the content-equivalence diff shows the bodies moved verbatim, but I did not
  exercise a live bootstrap generation against a real provider.
- **`apps/web` and other packages.** Not typechecked or tested. They reach this
  code only through the `fluxiq/automation-studio` barrel, whose export set is
  unchanged.

## Open questions or contradictions found

**The brief's description of the trap was slightly off, in a way that did not
change the fix.** It says `plan.ts` carries "two barrel-skipping imports
reaching `../../nodes/`". In fact only one reached `nodes/` — the type-only
`../../nodes/contracts.ts`. The second was `../llm/token-estimation.ts`. The two
need different treatment: the `nodes/` one routes through `nodes/index.ts` as
the brief says, but the `llm/` one cannot, because `runtime/llm/index.ts`
deliberately withholds `token-estimation.ts`. That is why one import stayed at
the `plan.ts` level instead of both disappearing.

**`plan/` sits exactly at the path-depth limit.** Files under it are 9 segments
deep and `LIMITS.maxPathSegments` is 9, so they pass, with nothing to spare. Any
further subdirectory under `plan/` would fail the `naming` rule's depth check.
If a later phase wants to split `validation.ts` (248 lines, the largest
remaining piece) it must do so into more siblings inside `plan/`, not into a
nested folder.

**`flow-bootstrap/generation-failure.ts` is 502 lines** and carries a standing
`file-lines` warning. It is outside this brief and nobody currently owns it. If
Phase 6 wants the directory fully under the advisory threshold, it needs its own
brief.
