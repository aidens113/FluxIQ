# Report: core-automation-studio-facade (Phase 7, the centrepiece)

## Outcome

Done — **ten collaborators** extracted across four dispatches, stopping at the
instructed count each time (two, two, four, two).

`packages/fluxiq/src/programs/automation-studio/runtime/service.ts` went from
**12,482 lines to 10,269** and `AutomationStudioService` from **422 methods to
287**. The 178 public method names are identical, in the same order, after every
step, and the resolved export set of `runtime/index.ts` is the same 276 names.
Eleven differential probes drove the pre-extraction implementation and the
facade side by side over **716 observations** and found no difference.

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
| **4** | **`service/flows/`** | **7 public + 14 private** | **11,373 → 10,734** | **322 → 308** |
| **4** | **`service/recordings/`** | **1 public + 23 private** | **10,734 → 10,269** | **308 → 287** |

Round 4 took the two the coordinator ordered: the combined Flow-documents and
SQL-projections collaborator, then the recording pipeline. Both landed with the
white-box coupling grep run **before** the cut, as instructed — it found one
coupled site in the first and none in the second.

## What changed and why

### Round 4, collaborator 1 — `service/flows/`

The cycle is real and the combined cut resolves it. Eight of
`projectDatabasePool`'s methods call the Flow document accessors and four of
those accessors call straight back; owning both sides in one class removes the
question of which goes first.

The honest boundary is **tighter than the ~26 estimate**. Growing the seed to
its transitive closure — every method that touches `projectDatabasePool` plus
every Flow accessor — snowballs through the flow-save pipeline and the summary
repositories to **54 methods and 1,077 lines**, which is past the 40-method
limit and would need a two-class split with mutual references. The **cycle core**
closes at **21 methods and 401 lines**, measured, with zero outward calls:
twelve SQL projection methods, five Flow document accessors, and four
database-only query methods (`listFlowMetadataPage`, `getFlowMetadataDetail`,
`listProjectHierarchyChildren`, `listProjectChangeFeed`) that add no new
dependency. Seven of the 21 are public and stay on the facade as delegations.
`applyFlowGraphPatch`, `saveFlowInternal`, `getLlmExecutionBinding` and the rest
of the orchestration layer stay where they are and call in.

Twenty transitive helpers came with it, placed by who needs them rather than by
where they sat: eight exclusive ones are private in `store.ts`, eight shared
flow-mapping helpers are exported from a sibling `flows/mapping.ts`, and five
generic ones moved to two new neutral modules, `service/json-values.ts`
(`isJsonRecord`, `jsonObjectFromUnknown`, `stringOrNull`) and
`service/collections.ts` (`uniqueStrings`, `upsertBy`, later
`mapWithConcurrency`). No module exports more than eight values.

### Round 4, collaborator 2 — `service/recordings/`

The recording pipeline: the pipeline index, its artifact documents, the physical
cleanup after a deleted recording, and the recording documents those read.
**24 methods, 402 lines, closed at wave 4** of the closure walk. Only
`getRecordingSession` is public.

One wiring problem had to be solved rather than worked around.
`getRecordingSession` awaits `this.ready`, the seed-fixture gate, which the
facade cannot build until *after* its collaborators exist — `seedFixture()` uses
them. Passing `() => this.ready` would have reintroduced exactly the callback
residue round 2 removed. Instead the collaborator holds a promise and the facade
hands it over with `bindReady(this.ready)` immediately after creating it, in the
same constructor, before any method can run. The collaborator holds a promise,
never a reference to the facade, and the class already uses this idiom
(`bindLlmExecutionProvider`, `bindHostRuntime`, `bindNativeNodeRuntime`).

### The white-box coupling grep, run before each cut

**`service/flows/` — one site found, in `service-subflow-pagination.test.ts`:**
three stubs of the private `tryWithFlowResourceRepository` on the instance. They
were repointed to `(service as any).flows.tryWithFlowResourceRepository` with no
assertion changed. A fourth block in the same file stubs
`flowSubflowSummaryRepository`, which did **not** move — my first blanket replace
caught it too and was reverted. Worth recording: the grep tells you which names
moved, but the edit still has to be per-site.

**`service/recordings/` — no coupled sites.** The only hit across both
repositories was `getRecordingSession`, and every one is a public API call
(`automationStudio.getRecordingSession(...)` in `framework/tests/index.test.ts`
and `client-gateway/tests/bridge.test.ts`), unaffected because the facade keeps
the public method.

The grep cost about a minute per cut and turned what would have been a
post-suite investigation into a planned edit. It is worth keeping as a standing
step.

### A rewrite gap this round exposed

The call-site rewrite matched `this.name(` only. `readPipelineArtifact` is called
as `this.readPipelineArtifact<PolicyProposalArtifact>(...)` — with explicit type
arguments — and five such sites were missed. `tsc` caught every one immediately,
so nothing shipped, and the rewriter now matches `this.name(` **and**
`this.name<`. Earlier rounds were clean on this (their type checks passed), but
anyone reusing the scripts should know the two shapes exist.

### What was deliberately not done

- **`objectStore`'s remaining 15 methods** are not closed: 17 outward calls, and
  they are the recording and project *deletion* flows. This round's recording
  store removed part of the layer beneath them; the rest is the project-artifact
  path.
- **`repositories` (45 methods, 1,175 lines, 41 outward)** — still the largest
  and still not extractable without more layers beneath it.
- **`tests/service.test.ts` was not split.** It names none of the 145 relocated
  methods.
- **No baseline regeneration**, per the brief.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime --reporter=basic`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Round 4 baseline (at b797488) | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| After `service/flows/` | 32 (2 failed) | 400 (3 failed) | the same three |
| After `service/recordings/` | 32 (2 failed) | 400 (**4** failed) | the same three plus the second pagination case |
| **b797488 re-measured now** | 32 (2 failed) | 400 (**4** failed) | **the identical four** |

The fourth failure was chased, not assumed. That file passes **5/5 twice in
isolation** with the repointed stubs in place, and reverting *both* `service.ts`
and the pagination test to b797488 — leaving the rest of the tree alone —
reproduces the identical four. It is the load-dependent flake this report
recorded in round 2, and today's machine state shows it where this morning's
baseline run did not. The failure set matches the committed baseline measured
under the same conditions.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, no output,
after each collaborator. Three intermediate failures were mine and fixed before
proceeding: duplicate identifiers when the import generator re-emitted the
facade's own barrel, a missing `stableJson` sibling import, and the generic
call-site gap above.

**Consumers** —
`npx vitest run src/programs/automation-studio/api src/programs/automation-studio/client-gateway`:
11 files, **43 passed (43)**, exit 0.

**Public method surface** — AST extraction of non-private methods, after each
step: `diff` against the pre-work list is empty. **178 names, same order.**

**Resolved barrel export set** — `checker.getExportsOfModule` for
`runtime/index.ts`: **276 exports, identical** to the pre-work original.

**Differential probes**, both modes, pre-extraction implementation vs facade:

| Round | Probe | Observations |
| --- | --- | --- |
| 1 | paths | 284 |
| 1 | index stores | 59 |
| 2 | project store | 68 |
| 2 | legacy store | 54 |
| 3 | ui cache | 38 |
| 3 | bootstrap adaptations | 24 |
| 3 | locks | 8 |
| 3 | object documents | 63 |
| **4** | **flow store** | **66** |
| **4** | **recording store** | **52** |
| | **total** | **716**, every one equal |

The flow probe drives `createFlow`, `createFlowSubflow`, `saveFlow` and the
seven delegated public methods, then all fourteen private store methods directly,
including `markSqlFlowDeleted` and the reads that follow it; 28 of its 33 durable
observations are successful calls rather than error paths. The recording probe
drives `createRecording`, `appendRecordingEvents`, `finalizeRecording`,
`listPipelineArtifacts` and `deleteRecording`, then the pipeline writes, reads,
removals and physical prunes directly.

Two scrubbing lessons: an in-memory service has no project catalogue, so the
flow fixture itself had to become an observation (both sides fail identically at
`createFlow`); and recording payloads carry `monotonicOffsetMs` and ISO-8601
timestamps, which are wall-clock derived and must be scrubbed like ids.

Transcripts at `<scratchpad>/asfacade-flows-transcript.txt` and
`asfacade-recordings-transcript.txt`. The probes are kept at
`<scratchpad>/asfacade-*-probe.test.ts.kept` and are **not** in the tree; neither
is the baseline copy of `service.ts` they import.

**Structure audit** — after `git add -N` on everything created:

| Rule | New findings under `runtime/service` |
| --- | --- |
| `imports`, `class-methods`, `directory-files`, `naming`, `exported-values`, `test-placement` | **0 each** |
| `file-lines` | 0 failures, **2 new warnings** |

The two warnings are `service/flows/store.ts` at 590 lines and
`service/recordings/store.ts` at 506, both past the 400-line advisory threshold
and both well under the 800-line limit. They are the first warnings this work has
produced, and they are deliberate: splitting `flows/store.ts` is what the cycle
forbids, and splitting `recordings/store.ts` would separate the pipeline writes
from the pipeline deletes that read them.

Two baseline entries fell and neither rose:

```
class-methods  runtime/service.ts::AutomationStudioService   287  (recorded 322)
file-lines     runtime/service.ts                          10269  (recorded 11373)
```

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` at repository scope.** Not run. The
  package's own `tsc --noEmit` is clean and the audit was run rule by rule.
- **The built `dist/`.** Not rebuilt; the resolved export set is provably
  identical and every collaborator field on the facade is `private`.
- **`apps/web` and the downstream extension repository.** Out of scope.
- **Live browser behaviour.** Nothing here is browser-side.
- **`prepareArtifactDocument`'s object-reference branch** (noted in round 3;
  unchanged).
- **`pnpm structure:baseline`.** Not run, per the brief.
- **Separate commits.** Each step's input file is preserved:
  `<scratchpad>/asfacade-service-r4-base.ts` (at b797488), `-step1`, `-step2`.
  The extraction scripts (`asfacade-extract-{flows,recordings}.mjs`) are
  deterministic and each takes the previous step's file as input. One caveat for
  replay: the recordings script appends `mapWithConcurrency` to
  `service/collections.ts` and now throws rather than appending twice, so restore
  that file before re-running it.

## Open questions or contradictions found

### 1. Line count and method count have fully diverged, as predicted

Round 4 removed **1,104 lines** and only **35 methods** from the class. Of the 45
methods relocated, eight were public and kept their names on the facade. The
class is at 287 against a floor of 178, and the file is at 10,269 against a
limit of 800. **Bodies leaving the file is the whole of the remaining value**;
the ratchet will keep falling slowly and will stop at 178 while the file is still
several thousand lines over. Both numbers are in the table above for every step,
per instruction.

### 2. What is left, measured after round 4

| Field(s) | Methods | Public | Lines | Outward | Note |
| --- | --- | --- | --- | --- | --- |
| `objectStore` (remainder) | 15 | 11 | 495 | 17 | recording + project deletion flows; needs the project-artifact layer beneath |
| `repositories` | 45 | — | 1,175 | 41 | the largest; still needs layers beneath it |
| `projectDatabasePool` (remainder) | 4 | 3 | — | 6 | `applyFlowGraphPatch`, `getLlmExecutionBinding`, `deleteFlowBootstrapRouter`, `getFlowGraphViewport` — orchestration over the flow store |
| `recordingStateIndexes` | 5 | 1 | 61 | 3 | |
| `recordingDomains` | 6 | 6 | 120 | 4 | |
| `ioRuntime`, `nativeNodeRuntime`, `llmProviderResolver`, `hostRuntime`, `runtimeService`, `runtimeAbortControllers`, `adaptiveRuntimeAdmissions`, `reusableLlmContext*` | 1-13 each | mixed | — | 10-28 | the runtime/LLM side |

No closed cluster remains. Every further extraction needs either a paired cut
(as `flows/` was) or a layer extracted beneath it first (as `recordings/` needed
`object-documents`). The storage layer is now largely out; what is left is
orchestration over it and the runtime/LLM side, where the outward counts are 10
to 28 and the state is genuinely shared.

### 3. The depth ceiling is still not binding, but `repositories` will test it

`service/flows/store.ts` and `service/recordings/store.ts` are 9 path segments,
exactly `LIMITS.maxPathSegments`, and that rule does not ratchet. Both fit as one
file each. `repositories` at 1,175 lines is the first that cannot: it exceeds the
800-line file limit on its own and would need either
`service/<group>/<sub>/<file>.ts` — which the depth rule rejects — or several
sibling files in one directory. The second is possible (`service/repositories/`
holding `flows.ts`, `recordings.ts`, `runs.ts`, …) provided the split does not
cut a cycle. **That is the decision to make before that dispatch**, and it is a
question for the coordinator rather than something to work around.

### 4. Costs confirmed again

- **White-box tests follow private methods.** One coupled site this round, found
  before the cut and fixed as a planned edit rather than a failure to diagnose.
  The grep is cheap; keep it.
- **The import generator earns its keep.** Round 4 moved 45 methods and 28
  helpers across five new files; the import blocks were derived from
  `service.ts`'s own imports and re-relativised, not written by hand. Its two
  rules worth knowing: never re-emit the facade's own barrel, and sibling
  collaborator imports are written explicitly.
