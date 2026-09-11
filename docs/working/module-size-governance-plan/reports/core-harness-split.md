# Report: core-harness-split

Phase 6. `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness.ts`
split into `runtime/llm/harness/`, types first and then bodies, with
`harness.ts` kept as a one-line facade.

## Outcome

Done.

## What changed and why

`harness.ts` was 1,161 lines with 31 exported names (18 types, 6 consts,
7 functions) and 13 exported values — one `file-lines` **failure** (1,161 >
800) and one `exported-values` warning (13 > 8). It is now:

```ts
export * from "./harness/index.ts";
```

one line, and the 1,160 lines of body live in 14 modules plus a barrel under
`runtime/llm/harness/`. The facade keeps the filename because this repository
writes explicit `.ts` extensions in relative specifiers (1,388 of them in
`packages/fluxiq`), so a directory does not satisfy an existing `./harness.ts`
import. Seven files import `./harness.ts` or `../harness.ts` — `index.ts`,
`deepseek-provider.ts`, `evidence-loop.ts`, `execution-grants.ts`,
`run-budget.ts` and three tests — and **none of them changed**.

| Module | Lines | Owns |
| --- | --- | --- |
| `index.ts` | 49 | the barrel: exactly the 31 names `harness.ts` exported |
| `diagnostic.ts` | 9 | `AutomationStudioLlmDiagnostic` |
| `provider.ts` | 22 | provider metadata, usage summary, provider contract |
| `task-kind.ts` | 46 | task kinds, prompt versions, task→output and task→intervention-kind maps |
| `token-limits.ts` | 65 | token/cost ceilings, limit resolution, usage validation, token estimation |
| `instruction.ts` | 109 | instruction resolution types, resolver, scope matching, ordering, truncation |
| `context-packet.ts` | 177 | the context packet type and `packAutomationStudioLlmContext` with its compactors and the reusable-context sanitizer |
| `failure-evidence.ts` | 55 | failure-evidence byte cap, capture input, sanitizer, bounds check, provenance digest |
| `structured-response.ts` | 75 | response and runtime-patch shapes, target-override guard, metadata stripping, summarization |
| `task-request.ts` | 71 | `AutomationStudioLlmTaskRequest`, `...TaskResult`, `...HarnessInput` |
| `output-validation.ts` | 72 | `validateAutomationStudioLlmOutput` and its patch validators |
| `json-bounds.ts` | 31 | the shared JSON/bounded-value predicates |
| `provider-result.ts` | 244 | parsing and validating the untrusted provider result |
| `intervention.ts` | 57 | building the `AutomationStudioFlowIntervention` record |
| `run.ts` | 200 | `runAutomationStudioLlmHarness`, deadline enforcement, abort failure |

Largest file is 244 lines, so the directory is under the 400-line advisory
threshold everywhere, not merely under the 800-line limit. Fifteen files keeps
the directory at the 15-file advisory threshold rather than past it.

**The two deliberate decisions in `runtime/llm/index.ts` are preserved
untouched.** That barrel still re-exports only what `runtime/index.ts`
published before the Phase 3 move, and `token-estimation.ts` is still
unexported. `runtime/llm/index.ts` has a zero-line diff. The harness's own
`estimateTokens` (4 chars per token) is a different estimator from
`token-estimation.ts`'s `estimateAutomationStudioLlmTokensFromUtf8Bytes`
(3 bytes per token); I moved the harness one into `token-limits.ts` verbatim
and did **not** unify them, which would have been a behaviour change.

Private helpers stayed private. `expectedOutputForTask`, `kindForLlmTask`,
`validateAutomationStudioLlmUsage`, `estimateTokens`,
`failureEvidenceProvenance`, `stripAutomationStudioLlmResponseMetadata`,
`summarizeAutomationStudioLlmResponse`, `parseAutomationStudioLlmProviderResult`,
`interventionFromLlmResult` and the `json-bounds` predicates gained an `export`
keyword only because they now cross a file boundary; none of them is named in
`harness/index.ts`, so none reaches any barrel or any consumer.

No runtime import cycle exists. Every cycle in the graph is type-only
(`provider.ts` ↔ `task-request.ts`, `context-packet.ts` ↔ `task-request.ts`,
`failure-evidence.ts` → `context-packet.ts`), and `verbatimModuleSyntax` erases
`import type` entirely.

Every relative specifier from inside `harness/` reaches either a directory
barrel (`../../flow-bootstrap/index.ts`, `../../../model/index.ts`,
`../../../nodes/index.ts`, `../../../../../core/index.ts`) or a file of a
directory `harness/` lives inside (`../provider-contract.ts`,
`../run-budget.ts`, `../evidence-loop.ts`, `../../reusable-llm-context.ts`),
which the `imports` rule exempts. The audit confirms: zero new `imports`
findings.

## Commands run and observed results

**Exported-name diff — the primary evidence.** A TypeScript compiler-API
script enumerating `checker.getExportsOfModule` for `runtime/llm/harness.ts`
and `runtime/llm/index.ts`, before and after:

```
$ diff -u harnesssplit-exports-before.txt harnesssplit-exports-after.txt
DIFF_EXIT=0
```

Empty diff. `harness.ts` resolves to the same **31** names and
`runtime/llm/index.ts` to the same **73** names as before the split.

**Line-coverage proof.** A script mapping the 72 extracted line ranges back
onto the original file (recovered with `git show :<path>`):

```
duplicated lines: none
uncovered line numbers: 70
non-blank uncovered: 0
```

Every non-blank line of the original body (lines 31–1161) landed in exactly one
new module, none twice; the 70 uncovered lines are all blank separators. The
only text I wrote by hand is the import headers, the barrel, and the facade.

**Typecheck.**

```
$ npx tsc --noEmit          # packages/fluxiq
TSC_EXIT=0
```

Two intermediate failures, both mine, both fixed: `isJsonValue` missing from
`provider-result.ts`'s `json-bounds` import, and an unused `JsonObject` import
in `intervention.ts` (found by a one-off `tsc --noEmit --noUnusedLocals`, which
now reports nothing under `runtime/llm/harness/`).

**Scoped tests — before and after are identical.**

```
$ npx vitest run src/programs/automation-studio/runtime/llm/tests
before:  Test Files 6 passed (6)   Tests 83 passed (83)
after:   Test Files 6 passed (6)   Tests 83 passed (83)
```

Harness-adjacent runtime tests, run after the split (`flow-bootstrap-harness`,
`llm-deepseek-flow-bootstrap`, `completed-llm-evidence`, `reusable-llm-context`,
`reusable-llm-context-service`, `live-patch`, `adaptive-orchestrator`,
`intervention-mode`):

```
Test Files  8 passed (8)
     Tests  52 passed (52)
```

My scope's before-state was green, not red — the package's four known
pre-existing failures are in `service.test.ts`,
`service-subflow-pagination.test.ts` and `runtime-llm-grants.test.ts`, none of
which is mine, so I did not run them.

**Structure audit** (`node scripts/structure-audit.mjs --json`), findings under
`runtime/llm/`:

| | before | after |
| --- | --- | --- |
| `file-lines` fail `harness.ts` | 1,161 (limit 800) | gone |
| `exported-values` warn `harness.ts::values` | 13 (limit 8) | gone |
| anything new under `runtime/llm/**` | — | none |

Repository-wide the failure count moved 37 → 34 and warnings 111 → 112, but a
key-level diff attributes every other change to the two workers running
concurrently: `storage/project/schema.ts` (schema-split) and `api/handlers/`
(handlers-split). My directory contributed one removed failure, one removed
warning, and zero additions.

I ran `git add -N` on the 15 new files before trusting any audit number, since
the audit enumerates through `git ls-files`.

**Files touched.** `git status --short` over `runtime/llm/` shows `harness.ts`
modified and 15 new files under `harness/`. Every other file in the directory —
including `index.ts`, `token-estimation.ts` and all six tests — has a zero-line
diff. (They appear as staged adds because Phase 3 itself is not yet committed;
that staging is the runtime-split worker's, and I did not disturb it.)

## Not verified

- **I did not run `pnpm build`, `pnpm check`, or the full `pnpm --filter fluxiq
  test`.** A build rewrites `packages/fluxiq/dist`, which the plan records as
  the cause of spurious `Failed to load url` collection failures in `apps/web`
  for the workers running alongside me. Declaration emit through
  `tsconfig.build.json` and `scripts/rewrite-declaration-imports.mjs` is
  therefore unproven for the new directory; `tsc --noEmit` passing is not the
  same check. The supervisor should run the build once the concurrent wave
  lands.
- **No live or browser validation.** This is a pure file-boundary refactor with
  no behaviour change, but nothing exercised the LLM runtime against a real
  provider.
- **I did not run `pnpm structure:baseline`**, per the brief.
- The repository-wide audit numbers I quote were measured while three other
  workers were mid-edit, so only the `runtime/llm/**` rows are attributable to
  me with confidence.

## Open questions or contradictions found

- **A formatting defect travelled verbatim into `run.ts`.** Line 536 of the
  original had lost its indentation:
  `if (input.taskKind === "flow_bootstrap" && context.instructions.instructions.length === 0) budgetDiagnostics.push(...)`
  sits flush against the left margin among two-space-indented siblings. I
  copied it as-is rather than fixing it, to keep this change purely structural
  and the line-coverage proof exact. It is a one-character fix for whoever next
  edits `harness/run.ts`.
- **`estimateTokens` and `token-estimation.ts` are two different estimators of
  the same quantity** living four lines apart in the same directory — 4 chars
  per token in the harness, 3 UTF-8 bytes per token in the deliberately
  unexported module. That is not a contradiction I was asked to resolve, and
  resolving it would change what the harness reports as
  `estimatedInputTokens`, but it is worth a decision at some point rather than
  being rediscovered by the next worker here.
- The brief said "split its types out first, then its bodies." I read that as
  the sequencing advice it is rather than a demand for two separate landings,
  and did both in one pass: the types are in their own modules
  (`diagnostic`, `provider`, `task-kind`, `task-request`, `structured-response`
  and the type halves of `context-packet`/`instruction`/`token-limits`), and
  the bodies sit with the concept they serve. If the intent was two commits,
  the split is trivially separable along those file boundaries.
