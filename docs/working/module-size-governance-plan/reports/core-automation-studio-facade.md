# Report: core-automation-studio-facade (Phase 7, the centrepiece)

## Outcome

Done — **thirteen collaborators** extracted across five dispatches, stopping at
the instructed count each time (two, two, four, two, three).

`packages/fluxiq/src/programs/automation-studio/runtime/service.ts` went from
**12,482 lines to 9,342** and `AutomationStudioService` from **422 methods to
261**. The 178 public method names are identical, in the same order, after every
step, and the resolved export set of `runtime/index.ts` is the same 276 names.
Fourteen differential probes drove the pre-extraction implementation and the
facade side by side over **830 observations** and found no difference.

| Round | Collaborator | Methods relocated | `service.ts` | Class |
| --- | --- | --- | --- | --- |
| 1 | `service/paths/` | 41 | 12,482 → 12,048 | 422 → 381 |
| 1 | `service/indexes/` | 20 | 12,048 → 11,952 | 381 → 361 |
| 2 | `service/projects/` | 12 | 11,952 → 11,952 | 361 → 349 |
| 2 | `service/legacy/` | 10 | 11,952 → 11,839 | 349 → 339 |
| 3 | `service/ui-cache.ts` | 4 public | 11,839 → 11,736 | 339 |
| 3 | `service/bootstrap-adaptations.ts` | 1 public + 3 private | 11,736 → 11,656 | 339 → 336 |
| 3 | `service/locks.ts` | 3 private | 11,656 → 11,605 | 336 → 333 |
| 3 | `service/object-documents.ts` | 2 public + 11 private | 11,605 → 11,373 | 333 → 322 |
| 4 | `service/flows/` (store, mapping) | 7 public + 14 private | 11,373 → 10,734 | 322 → 308 |
| 4 | `service/recordings/` | 1 public + 23 private | 10,734 → 10,269 | 308 → 287 |
| **5** | **`service/flows/writer.ts`** | **2 public + 11 private** | **10,269 → 9,955** | **287 → 276** |
| **5** | **`service/flows/mutations.ts`** | **3 public + 5 private** | **9,955 → 9,765** | **276 → 271** |
| **5** | **`service/adaptations/`** (patches, durable) | **10 private** | **9,765 → 9,342** | **271 → 261** |

**`repositories` is not extractable, and not for the reason the plan assumed.**
It is not a cluster: the field is touched by 41 methods, **29 of them public** —
it is the canonical repository handle the service's own API surface uses, like
`projectPaths` before it. There is no ownership boundary to cut, so this round
took the three closed clusters that the last one made reachable instead. Details
in **Open questions**.

## What changed and why

### Round 5, collaborator 1 — `service/flows/writer.ts`

The Flow *write* pipeline, the natural counterpart to the Flow *read* store
extracted in round 4: `saveFlowInternal` (the largest private method left in the
file), `deleteFlowArtifact`, the representation checks, the generated source file
and config artifact, and the project change feed each write appends to. It reads
Flows back through `flows/store.ts` rather than reaching for documents itself,
so the dependency is one-way.

**13 methods, 229 lines of bodies, 0 outward calls** — measured, not assumed.
Two are public (`getProjectArtifact`, `saveProjectArtifact`) and came along
because the generated-config write goes through them; they stay on the facade as
delegations. Ten transitive helpers moved with it, three of them shared and so
exported back.

### Round 5, collaborator 2 — `service/flows/mutations.ts`

The durable Subflow and Router mutations: `saveFlowSubflow`, `saveFlowRouter`,
`createFlowSubflow`, the undo for a created Subflow, and the summary rows and
change-feed entries each write leaves behind. **8 methods, 159 lines, 0 outward.**
Three are public and stay as delegations. `CreateFlowSubflowInput` moved with
them and is re-exported by name, so the barrel is unchanged.

### Round 5, collaborator 3 — `service/adaptations/`

Applying and reverting an adaptation durably. This is the clearest instance yet
of the "extract the layer beneath first" pattern: measured **before**
`flows/mutations.ts` it was 18 methods with 3 outward calls; measured **after**,
it is **10 methods, 362 lines, 0 outward, touching exactly two fields**
(`flowWriter`, `flowMutations`). The mutation layer was the whole of what stood
in the way.

Split into two files because the split is free: `patches.ts` (the five per-kind
patch appliers, 212 lines) and `durable.ts` (the five orchestration methods that
dispatch to them, record what was mutated and roll back on failure, 150 lines).
The direction is **one-way — durable → patches, with zero back-references**,
verified by counting both directions before writing anything. Keeping them in one
file would have crossed the 400-line advisory threshold for no reason.

### The pre-cut white-box grep

Run before every cut this round, over both repositories.

**`flows/writer.ts`** — two hits, both **public API calls**
(`service.getProjectArtifact(...)`, `service.saveProjectArtifact(...)`), both
unaffected because the facade keeps the public method. No private reaches, no
instance stubs.

**`flows/mutations.ts` + `adaptations/`** — three kinds of hit, and the
distinction is the point:

1. Public API calls to `saveFlowRouter`, `saveFlowSubflow`, `createFlowSubflow` —
   unaffected.
2. `vi.spyOn(instance, "saveFlowRouter").mockRejectedValueOnce(...)` in
   `service-flow-bootstrap-adaptation.test.ts`, which injects a router failure to
   test rollback. **Unaffected, and it is worth saying why**: its caller,
   `applyFlowBootstrapAdaptation`, stays on the facade, and the facade's internal
   calls to public methods are deliberately *not* rewritten, so `this.saveFlowRouter(...)`
   still dispatches through the facade where the spy sits. A spy only breaks when
   its *caller* moves into a collaborator.
3. `flowSubflowSummaryRepository` in `service-subflow-pagination.test.ts` — a
   **private** method reached through a cast. Repointed to
   `(service as any).flowMutations.flowSubflowSummaryRepository`. This is the
   same block my round-4 blanket replace wrongly caught and I reverted; this time
   it was the intended target and the neighbouring `tryWithFlowResourceRepository`
   blocks, which point at `.flows`, were left alone. Per-site judgement, as my own
   caveat said.

### One more rewrite shape, found by the type checker

Round 4 added `this.name<T>(` to the call-site rewriter. Round 5 found a third
shape: a facade method that delegates **under a different name and with an extra
argument**. `saveFlow(input)` is exactly `this.flowWriter.saveFlowInternal(input, false)`
and `deleteFlow(input)` is `this.flowWriter.deleteFlowArtifact(input, false)`. A
moved body calling `this.saveFlow({...})` must therefore become
`this.flowWriter.saveFlowInternal({...}, false)` — a rename *and* an appended
literal, which needs balanced-paren scanning rather than string replacement. The
first attempt produced `this.flowWriter.saveFlow(...)`, which does not exist;
`tsc` caught all five sites immediately. The rewriter now carries a small table
for these and scans for the matching parenthesis.

### What was deliberately not done

- **`repositories` was not extracted.** See Open questions.
- **The recording-pipeline completion** (`writeRecordingPipelineArtifact`,
  `collectLiveProjectObjectReferences`, `loadProjectRecordings`) closes only by
  pulling in `validateRecordingFlowProposal`, which reaches `ioRuntime` and
  `nativeNodeRuntime` — the runtime side. Left alone.
- **`tests/service.test.ts` was not split.** It names none of the 176 relocated
  methods.
- **No baseline regeneration**, per the brief.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime --reporter=basic`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Round 5 baseline (at ce7e38b) | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| After all three collaborators | 32 (2 failed) | 400 (3 failed) | **the same three** |

`service-subflow-pagination.test.ts` alone, with both repointed stub blocks:
**5 passed (5)**.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, no output,
after each of the three collaborators. Four intermediate failures were mine and
fixed before proceeding: a missing helper closure on the first writer attempt,
two moved types (`CreateFlowSubflowInput`, the summary types) needing sibling
imports, a helper placed in the file that imports rather than the file that owns
it, and the renamed-delegation shape above.

**Consumers** —
`npx vitest run src/programs/automation-studio/api src/programs/automation-studio/client-gateway`:
11 files, **43 passed (43)**, exit 0.

**Public method surface** — AST extraction of non-private methods, after each
step: `diff` against the pre-work list is empty. **178 names, same order.**

**Resolved barrel export set** — `checker.getExportsOfModule` for
`runtime/index.ts`: **276 exports, identical** to the pre-work original.

**Differential probes**, both durable and memory mode, pre-extraction
implementation vs facade:

| Round | Probe | Observations |
| --- | --- | --- |
| 1 | paths, index stores | 284, 59 |
| 2 | project store, legacy store | 68, 54 |
| 3 | ui cache, bootstrap adaptations, locks, object documents | 38, 24, 8, 63 |
| 4 | flow store, recording store | 66, 52 |
| **5** | **flow writer** | **58** |
| **5** | **flow mutations** | **30** |
| **5** | **durable adaptations** | **26** |
| | **total** | **830**, every one equal |

The writer probe drives `createFlow`, `saveFlow` with a stale `expectedUpdatedAt`,
`compileAndSaveFlowSource` with invalid source, `convertFlowToVisual`,
`publishFlow`, the generated config artifact, and then all eleven private methods
directly, ending with a direct `deleteFlowArtifact` and the reads that follow.
The mutations probe drives Subflow creation, rename, Router save and the change
feed, then the private summary-row and undo methods. The adaptations probe drives
`saveFlowAdaptation` and `reviewFlowAdaptation`, then `applyFlowAdaptationDurably`,
`applyFlowAdaptationPatchDurably` with an unknown patch kind,
`recordAppliedAdaptationOnFlow`, both rollback paths and `revertFlowAdaptationDurably`.

Transcripts at `<scratchpad>/asfacade-flowwriter-transcript.txt` and
`asfacade-round5-transcript.txt`. The probes are kept at
`<scratchpad>/asfacade-*-probe.test.ts.kept` and are **not** in the tree; neither
is the baseline copy of `service.ts` they import.

**Structure audit** — after `git add -N` on everything created:

| Rule | New findings under `runtime/service` |
| --- | --- |
| `imports`, `class-methods`, `file-lines`, `directory-files`, `naming`, `exported-values`, `test-placement` | **0 each** |

The only warnings under `runtime/service` are the two accepted ones from round 4
(`flows/store.ts` 590, `recordings/store.ts` 506). Round 5 added none: the
writer is 380 lines, mutations 243, patches 297, durable 186 — every new file
under the 400-line advisory threshold, and no class over 13 methods.

Two baseline entries fell and neither rose:

```
class-methods  runtime/service.ts::AutomationStudioService   261  (recorded 287)
file-lines     runtime/service.ts                           9342  (recorded 10269)
```

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` at repository scope.** Not run. The
  package's own `tsc --noEmit` is clean and the audit was run rule by rule.
- **The built `dist/`.** Not rebuilt; the resolved export set is provably
  identical and every collaborator field on the facade is `private`.
- **`apps/web` and the downstream extension repository.** Out of scope.
- **Live browser behaviour.** Nothing here is browser-side.
- **`prepareArtifactDocument`'s object-reference branch** (round 3; unchanged).
- **`pnpm structure:baseline`.** Not run, per the brief.
- **Separate commits.** Each step's input file is preserved:
  `<scratchpad>/asfacade-service-r5-base.ts` (at ce7e38b), `-step1`, `-step2`,
  `-step3`. The three extraction scripts are deterministic and each takes the
  previous step's file as input.

## Open questions or contradictions found

### 1. `repositories` is a shared handle, not a cluster — the plan's largest remaining target does not exist

Measured: 41 methods touch `repositories`, **29 of them public**, 1,132 lines.
The list is the service's API surface — `createRecording`, `appendRecordingEvents`,
`finalizeRecording`, `mineRecordingEvidence`, `proposePolicyFromModel`,
`approvePolicyProposal`, `publishFlow`, `migrateFlows`, `deleteProjectArtifact`
and twenty more. There is no state to own and no boundary to draw: the canonical
repositories are a *dependency* every public operation needs, exactly as
`projectPaths` was before round 1, and extracting "the methods that touch it"
would mean extracting the public API.

Only **12 of the 41 are private**, and they do not form a group: they are the
write pipeline (now in `flows/writer.ts`), the pipeline writers, the flow
catalogue readers, and `seedFixture`. Three of them left this round as part of
other collaborators.

**Recommendation:** strike `repositories` from the plan as an extraction target
and replace it with what the measurement actually shows — the remaining work is
orchestration over collaborators, and the way to shrink it further is to keep
taking closed groups of *private* methods, not to chase the biggest field.

### 2. Treating a delegation as reachable changes what counts as closed

The closure walk used through round 4 counted a call to an already-delegating
facade method as an outward dependency. It is not: a moved method calling
`this.getFlow(...)` can reach the same code through `this.flows.getFlow(...)`,
because the facade method is nothing but that forward. Teaching the tool to
recognise a three-line `return await this.<field>.<name>(...)` body and treat it
as satisfied is what made this round's three collaborators visible — the flow
writer measured 7 outward under the old rule and 0 under the new one.

Anyone continuing should use `asfacade-closure2.mjs`, not the earlier
`asfacade-closure.mjs`. The caveat is the one in the rewrite section: a
delegation that renames or adds an argument needs a template, not a rename.

### 3. What is left, measured after round 5

98 private methods and 2,410 lines of private bodies remain, against 178 public
methods and 4,081 lines of public bodies. The largest private methods left are
almost entirely **runtime and LLM**: `maybeAnnotateRunDetailWithRuntimeLlm` (305
lines), `applyFlowBootstrapAdaptation` (117), `revertFlowBootstrapAdaptation`
(99), `migrateLegacyParentIntoOwnedSubflow` (85),
`retryRuntimeSessionAfterAutoAppliedPatch` (84), `maybePromoteRuntimeAdaptation`
(75). The plausible next groups, in order of how clean they measured:

| Candidate | Methods | Lines | Outward | Note |
| --- | --- | --- | --- | --- |
| flow-bootstrap application | ~6 | ~380 | not yet measured | `applyFlowBootstrapAdaptation`, `revertFlowBootstrapAdaptation`, `transitionFlowBootstrapAdaptation`; sits directly on `flowMutations` and `adaptations/`, so it may now be closed |
| flow catalogue readers | 8 | ~80 | 0 at wave 3 | `listCanonicalFlowArtifacts`, `listPublishedFlowSnapshots`, `listFlowPublicationRecords`, `loadProjectFlows`, `scopedProjectIdsForProject`, `inferLegacyProjectScopes` |
| recording state indexes | 4 | 20 | 0 | blocked only by `repairRecordingStateIndex` and `collectLiveProjectObjectReferences` also touching the field |
| recording-pipeline completion | 10 | 134 | 1 | closes only by pulling in `validateRecordingFlowProposal` → `ioRuntime` |
| runtime/LLM (`ioRuntime`, `nativeNodeRuntime`, `llmProviderResolver`, `hostRuntime`, …) | 1-13 each | — | 10-28 | genuinely shared state; the hard part |

### 4. The depth ceiling, now settled in practice

Confirmed by this round: `service/flows/` holds five files at 9 segments and
`service/adaptations/` two, and the audit is clean. Sibling files inside a
collaborator directory are the answer whenever one file would cross the 400-line
advisory threshold, and the split is free whenever the direction is one-way —
which is worth checking with a two-direction count before writing, as
`durable → patches` was.
