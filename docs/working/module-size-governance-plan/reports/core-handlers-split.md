# Report: core-handlers-split

Phase 6. `packages/fluxiq/src/programs/automation-studio/api/handlers.ts`,
2,091 lines with 3 exported functions, split behind a facade.

## Outcome

Done.

`handlers.ts` is now one line — `export * from "./handlers/index.ts";` — and
`api/handlers/` holds 21 modules. The three exported names, their signatures,
and every consumer import are unchanged; no file outside
`api/handlers.ts` and `api/handlers/**` was touched.

## What changed and why

`registerAutomationStudioApi` was a single 1,849-line body: 153 consecutive
`registry.register({ ... })` calls with no shared local state between them.
That is the giant-function-body pathology in its purest form, and it made the
split a partition rather than a rewrite — the registrations were cut at
`});` boundaries into 15 contiguous subject modules, each exporting one
private `register<Subject>Endpoints(dependencies)` function.

Because the original registrations closed over six parameters, the groups take
one `AutomationStudioApiDependencies` record instead of a six-argument list.
`register.ts` builds that record once and calls the 15 groups **in the original
registration order**, so the endpoint registration sequence is byte-for-byte the
one that ran before. The record's four optional collaborators are typed
`X | undefined` rather than as optional properties, because
`exactOptionalPropertyTypes` is on and the record is built from
`registerAutomationStudioApi`'s own optional parameters.

| module | lines | subject |
| --- | --- | --- |
| `projects.ts` | 223 | program snapshot, metrics, problems, projects, categories, hierarchy, change feed |
| `caches.ts` | 121 | project UI cache and the reusable LLM context pool |
| `workspace.ts` | 39 | workspace summary, recording and artifact listings |
| `flows.ts` | 159 | flow listings, metadata, save, settings, graph editing |
| `flow-lifecycle.ts` | 113 | compile, convert, delete, publish, node catalogues, migration, legacy retirement |
| `artifacts.ts` | 53 | single project artifact read/write/delete |
| `recordings.ts` | 358 | recording capture through normalization, evidence and policy |
| `runtime-sessions.ts` | 31 | runtime session listing and detail |
| `subflows.ts` | 164 | subflow listing, targets, mutations |
| `instructions.ts` | 119 | flow instructions, instruction sets, change proposals |
| `runs.ts` | 125 | flow runs, actions, events, adaptations |
| `router.ts` | 176 | flow router and flow-map routes, groups, fallbacks |
| `llm-generation.ts` | 229 | readiness, preflight, grants, generated adaptation |
| `runtime-execution.ts` | 104 | session start/run, state diff, signals, recording domains |
| `client-gateway.ts` | 102 | paired-client snapshot, trust, recording, action execution |
| `register.ts` | 44 | the public entry point; builds the record, calls the 15 groups in order |
| `dependencies.ts` | 19 | the shared dependency record type |
| `instruction-scope.ts` | 15 | `flowInstructionScopeFromPayload` (public) |
| `llm-execution-settings.ts` | 25 | `assertFlowLlmExecutionSettings` (public) |
| `bounded-whole-number.ts` | 7 | `boundedWholeNumber`, shared by the two above/below |
| `index.ts` | 6 | barrel: exactly the three public names |

The 13 module-level helpers from the old tail stayed private and moved to their
single consumer: `slugSegment` into `instructions.ts`,
`reusableContextDomainForScope` into `caches.ts`, and the ten flow-bootstrap
and bounded-accounting helpers into `llm-generation.ts`. Only
`boundedWholeNumber` had two consumers, so it became its own module.
`index.ts` re-exports by name rather than with `export *`, so the "exactly
three" property is pinned by the barrel itself and a private helper cannot leak
into the public surface by accident.

Naming was constrained by two audit rules that a directory of this size runs
into. The `naming` prefix rule fails at 3 files sharing a `<prefix>-` stem in
one directory, and the deadlock guard does not apply here (`api/handlers` is 7
segments against a 9-segment limit), so the hyphenated stems were chosen to keep
every prefix group at 2: `flow-` ×1, `runtime-` ×2, `llm-` ×2, `client-` ×1,
`instruction-` ×1, `bounded-` ×1. `directory-files` fails above 25, which is why
15 subject modules and not the ~24 the endpoint groupings would naturally
suggest; at 21 files the directory is over the 15-file advisory threshold (a
warning, which neither ratchets nor fails) with four files of headroom.

Import specifiers were rewritten one level deeper and all resolve clean under
the `imports` rule: `../contracts.ts` resolves onto the `api/contracts`
directory, `../../{model,runtime,storage,client-gateway}/index.ts` and the two
`identity-access` / root `client-gateway` barrels end in `index`, and
`../../../_shared/*.ts` has no barrel to skip. The audit reports zero `imports`
findings for the new directory, so no new baseline key was needed.

## Commands run and observed results

Before-state, on the tree as handed over:

- `npx vitest run src/programs/automation-studio/api/tests/handlers.test.ts`
  → `Test Files 1 passed (1)`, `Tests 34 passed (34)`.
- `npx tsc --noEmit` in `packages/fluxiq` → exit 0, no output.

After the split:

- `npx tsc --noEmit` in `packages/fluxiq` → **exit 0, no output.**
- `npx vitest run src/programs/automation-studio/api/tests/handlers.test.ts`
  → **`Test Files 1 passed (1)`, `Tests 34 passed (34)`** — same file count,
  same case count, same result.
- `npx vitest run src/programs/automation-studio/runtime/tests/reusable-llm-context-service.test.ts src/programs/automation-studio/runtime/tests/service-flow-bootstrap-adaptation.test.ts`
  → `Test Files 2 passed (2)`, `Tests 13 passed (13)`. These two are the only
  other files that import `registerAutomationStudioApi` by path; they were run
  read-only to confirm the facade resolves for them.
- `node scripts/structure-audit.mjs`, after `git add -N` on the new directory →
  34 violations across 4 rules, **none of them under
  `packages/fluxiq/src/programs/automation-studio/api/`**. The only api-path
  lines are two advisory warnings:
  `warn [directory-files] .../api/handlers/: 21 source files is past the 15-file advisory threshold`
  and the same warning for `api/contracts/` (17 files, another worker's
  directory). The 34 failures are pre-existing or belong to other workers'
  in-flight areas (`apps/web` view-registry imports, `runtime/flow-bootstrap`,
  `storage/project`, the two `working-docs` findings).

### Exported-name diff

Taken with the TypeScript checker over the module symbol, so it covers types as
well as values. The pre-split file was restored beside the facade under a
worker-unique name for the comparison and deleted immediately after.

```
===== handlers-before-core-handlers-split.ts (3) =====
function assertFlowLlmExecutionSettings :: (metadata: Record<string, unknown>) => void
function flowInstructionScopeFromPayload :: (projectId: string, flowId: string, payload: SaveFlowInstructionRequest) => AutomationStudioInstructionScope
function registerAutomationStudioApi :: (registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService | undefined, clientGatewayBridge?: AutomationStudioClientGatewayBridge | undefined, clientGateway?: ClientGatewayService | undefined, llmExecutionGrants?: AutomationStudioLlmExecutionGrantService | undefined...

===== handlers.ts (3) =====
function assertFlowLlmExecutionSettings :: (metadata: Record<string, unknown>) => void
function flowInstructionScopeFromPayload :: (projectId: string, flowId: string, payload: SaveFlowInstructionRequest) => AutomationStudioInstructionScope
function registerAutomationStudioApi :: (registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService | undefined, clientGatewayBridge?: AutomationStudioClientGatewayBridge | undefined, clientGateway?: ClientGatewayService | undefined, llmExecutionGrants?: AutomationStudioLlmExecutionGrantService | undefined...
```

Identical: three names, same kinds, same signatures. (Both signature strings are
truncated at the same point by the printer's default width; the elided tail is
`) => void` in both.)

### Body-preservation check

The registration bodies were reassembled from the 15 new modules, in call order,
and compared line for line against the pre-split backup:

```
registration body lines: original 1847, rebuilt 1847, identical True
```

So the split moved code; it did not rewrite it. Every top-level declaration from
the old helper tail was also matched verbatim in the new directory (the two
reported as unmatched, `flowInstructionScopeFromPayload` and
`assertFlowLlmExecutionSettings`, are an artifact of the matcher stripping the
`export ` keyword from one side only — both are present and exported, which the
export diff above confirms).

A separate scan found **no unused imports** across the 21 new modules.

## Not verified

- `pnpm build` was not run. `tsconfig.build.json` builds with `tsc -b --clean`
  and then rewrites declaration imports under `packages/fluxiq/dist/`, which is
  shared state outside my owned paths while three other workers are editing this
  package. The facade shape is the one `api/contracts.ts` already uses
  (`export * from "./contracts/index.ts";`), so the declaration rewriter has
  precedent for it, but I did not exercise it.
- `pnpm check` as a whole was not run; only its `tsc --noEmit` component, per
  package. The structure audit was run directly.
- No live browser or runtime validation — this is a pure code-movement change
  with no behaviour surface of its own.
- The package-wide `vitest run` was not executed. Scoping was deliberate: three
  other workers are mutating `runtime/service.ts`, `runtime/llm/harness.ts` and
  `storage/project/schema.ts` concurrently, so a full run would attribute their
  in-flight state to this change. Both `tsc --noEmit` runs did cover the whole
  package and both were exit 0.
- `pnpm structure:baseline` was not run, as instructed. The audit reports 9
  baseline entries that can now be lowered; the `file-lines` entry for
  `api/handlers.ts` (frozen at 2,094) is one of them — it is now 1 line.

## Open questions or contradictions found

- **The baseline's `limits.maxPathSegments` is 8; `scripts/structure-audit/context.mjs`
  sets 9.** The live rule reads `ctx.LIMITS`, so 9 is what runs and the recorded
  8 is stale — the baseline's `limits` block is a snapshot, not the source of
  truth. It matters more than it looks: the prefix rule's deadlock guard is
  `dir.split("/").length + 1 >= LIMITS.maxPathSegments`, so under 8 the guard
  would have exempted `api/handlers/` from the prefix rule entirely, and under 9
  it does not. I designed the filenames for the stricter reading (9), so this
  directory is correct either way, but the next worker to hit the guard should
  know the two numbers disagree. Worth reconciling when the baseline is next
  regenerated.
- The `imports` baseline carries `api/handlers.ts: 4`, but the file produced
  zero import findings before this change and produces zero now. That entry was
  already dead — probably from before `api/contracts/` became a directory. It
  will disappear on the next `structure:baseline`.
- `api/handlers/` sits at 21 files against a 25-file hard limit. It is under
  the cap with room, but a future phase that adds endpoint groups here will hit
  `directory-files` before it hits `file-lines`. If that happens, the natural
  next cut is by subject family (project / flow / recording / runtime) rather
  than by adding more siblings.
