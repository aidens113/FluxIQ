# Report: core-automation-studio-facade (Phase 7, the centrepiece)

## Outcome

Done — **eight collaborators** extracted across three dispatches, stopping at the
instructed count each time (two, two, four).

`packages/fluxiq/src/programs/automation-studio/runtime/service.ts` went from
**12,482 lines to 11,373** and `AutomationStudioService` from **422 methods to
322**. The 178 public method names are identical, in the same order, after every
step, and the resolved export set of `runtime/index.ts` is the same 276 names.
Nine differential probes drove the pre-extraction implementation and the facade
side by side over **598 observations** and found no difference.

| Round | Step | Collaborator | Methods relocated | `service.ts` | Class |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | `service/paths/` | 41 | 12,482 → 12,048 | 422 → 381 |
| 1 | 2 | `service/indexes/` | 20 | 12,048 → 11,952 | 381 → 361 |
| 2 | 3 | `service/projects/` | 12 | 11,952 → 11,952 | 361 → 349 |
| 2 | 4 | `service/legacy/` | 10 | 11,952 → 11,839 | 349 → 339 |
| 3 | 5 | `service/ui-cache.ts` | 4 public + 2 new | 11,839 → 11,736 | 339 (unchanged) |
| 3 | 6 | `service/bootstrap-adaptations.ts` | 1 public + 3 private | 11,736 → 11,656 | 339 → 336 |
| 3 | 7 | `service/locks.ts` | 3 private | 11,656 → 11,605 | 336 → 333 |
| 3 | 8 | `service/object-documents.ts` | 2 public + 11 private | 11,605 → 11,373 | 333 → 322 |

**A delegated public method does not lower the class count** — the facade keeps
the name and forwards. Round 3 relocated 24 methods but the ratchet fell by only
17, which is the seven public bodies now living in a collaborator behind an
unchanged public signature. Worth knowing before anyone reads the ratchet as a
measure of progress.

Round 3 also produced the negative result the coordinator asked for: the
`projectDatabasePool` cluster **cannot** be extracted next, and the reason is a
genuine two-way dependency, measured and listed in **Open questions**.

## What changed and why

### The eight collaborators

| File | Class / exported values | Methods | Lines | Owns |
| --- | --- | --- | --- | --- |
| `service/paths/project.ts` | `AutomationStudioProjectPaths`, `projectArtifactDocumentFileName` | 12 | 70 | the storage root and every path under a project |
| `service/paths/flow.ts` | `AutomationStudioFlowPaths` | 20 | 89 | every path under one Flow |
| `service/paths/recording.ts` | `AutomationStudioRecordingPaths` | 9 | 56 | every path under one recording session |
| `service/indexes/store.ts` | `AutomationStudioServiceIndexes` + 3 empty-index constructors | 20 | 184 | the nine per-project JSON indexes |
| `service/indexes/types.ts` | — (types only) | — | 121 | index shapes and the six public summary types |
| `service/projects/store.ts` | `AutomationStudioProjectStore`, `normalizeProjectCategories` | 12 | 111 | the project catalogue, legacy-store migration, storage readiness |
| `service/projects/types.ts` | — (types only) | — | 10 | `AutomationStudioProjectRecord`, `AutomationStudioProjectIndex` |
| `service/legacy/store.ts` | `AutomationStudioLegacyRetirementStore`, `legacyDiagnostic`, `legacyArtifactsDigest` | 10 | 136 | retirement state, audit trail, source backups, legacy artifact reads |
| `service/ui-cache.ts` | `AutomationStudioServiceUiCache` | 6 | 147 | the per-user UI cache store and its request validation |
| `service/bootstrap-adaptations.ts` | `AutomationStudioBootstrapAdaptationStore` | 4 | 108 | Flow bootstrap adaptations, in memory and on disk |
| `service/locks.ts` | `AutomationStudioServiceLocks` | 3 | 64 | the three keyed promise chains |
| `service/object-documents.ts` | `AutomationStudioObjectDocuments`, `isStateSnapshotObject`, 2 public asset types | 13 | 272 | everything that reads or writes through the object store |
| `service/stable-json.ts`, `compact-json.ts`, `error-message.ts` | one function each | — | 19 | helpers genuinely shared by the facade and collaborators |
| five barrels | — | — | 19 | barrels |

**1,406 lines of collaborator against 1,109 removed from `service.ts`**, so the
whole transformation costs **+297 lines, +2.4%** on a 12,482-line starting point.
(The `ClientGatewayService` pilot measured +87% at 636 lines. Indirection
overhead is per collaborator, not per method, so it amortises exactly as that
report predicted.)

### Round 3, step by step

**`service/ui-cache.ts`** — four public methods, their eight validation helpers
(every one exclusive to them, checked transitively), and the store itself. The
four keep their names and signatures on the facade and forward. `close()` and
`deleteProject()` still need the store, so the collaborator exposes `close()` and
`purgeProject()` rather than handing the store back out; the `.catch(() =>
undefined)` on the two purge sites stays at the call site, where it was.

**`service/bootstrap-adaptations.ts`** — the four methods that read and write Flow
bootstrap adaptations, owning `memoryBootstrapAdaptations`, which is the whole
store when there is no storage root and a read-through cache when there is one.

**`service/locks.ts`** — the three `with*Lock` wrappers and their three maps. They
look like three copies of one function and are not: the recording chain absorbs a
rejected predecessor (`previous.then(() => current, () => current)` and `await
previous.catch(...)`), the two bootstrap chains propagate it (`previous.then(()
=> current)` and a bare `await previous`). Each body is kept verbatim and the
difference is documented in the file so nobody "tidies" it later. The probe
exercises both shapes; in every scenario it could construct they behave
identically, because the wrapper never lets a predecessor's rejection escape —
the difference is reachable only if the chain itself rejects. Preserved anyway.

**`service/object-documents.ts`** — the layer beneath `objectStore`, extracted
exactly as the coordinator framed it. 13 methods: artifact documents above the
inline threshold, renderable project assets, pipeline artifact documents, and the
state snapshots a recording entry points at. Measured **zero outward calls**
before the cut. This drops the `objectStore` cluster from 28 methods to 15 and
removes their dependency on the layer below; the remaining 15 are the recording
and project deletion flows, which are not yet closed.

Three helpers in that closure were shared with methods that stayed.
`compactJsonObject` (11 other callers) and `errorMessage` (4) are generic and
went to neutral one-function modules beside `stable-json.ts`;
`isStateSnapshotObject` is a state-snapshot concern, so it is exported from
`object-documents.ts` and imported back — the same rule used for
`normalizeProjectCategories` and `legacyDiagnostic`.

### Two tests had to move with the methods

This is the first round where a test changed, and it is worth recording because
the plan will hit it again. Four tests in
`tests/service-flow-bootstrap-generation.test.ts` failed after step 6 and step 7.
Neither was a behaviour change:

- three call `(instance as any).listFlowBootstrapAdaptations(...)`, a **private**
  method, now owned by the bootstrap-adaptation store;
- one stubs `(instance as any).withBootstrapGenerationLock = vi.fn().mockRejectedValue(...)`
  to prove a lock failure is attributed to the generic pre-provider fallback.
  After the extraction the stub landed on an object the facade no longer calls, so
  the real lock ran and the diagnostic differed.

Both were repointed at the new owner — `(instance as any).bootstrapAdaptations.
listFlowBootstrapAdaptations(...)` and `(instance as any).locks.
withBootstrapGenerationLock = ...` — with no assertion changed. A grep for all 26
methods relocated this round across every `*.test.ts` in the package found these
two sites and no others.

**The probes did not catch this and could not have**: the behaviour was
unchanged, the coupling was. That is the honest division of labour between the
two kinds of evidence, and it is why the suite still has to run.

### What was deliberately not done

- **`tests/service.test.ts` was not split.** It names none of the 100 relocated
  methods; every test in it drives the public facade.
- **`runtime/index.ts` was not touched.** The collaborators are private to
  `runtime/service/`.
- **`projectDatabasePool` was not extracted.** See Open questions.
- **No baseline regeneration**, per the brief.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime --reporter=basic`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Round 3 baseline (at e55a141) | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| After steps 5-8, before the test repoint | 32 (3 failed) | 400 (**8** failed) | the three, plus 4 in `service-flow-bootstrap-generation.test.ts` and a second pagination case |
| After the test repoint | 32 (2 failed) | 400 (3 failed) | the same three as the baseline |

`service-flow-bootstrap-generation.test.ts` alone: **33 passed (33)**.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, no output, after
each of steps 5, 6, 7 and 8 and at the end. Two intermediate failures were my own
and were fixed before proceeding (a missing `JsonObject` import in the new
`compact-json.ts`, and `normalizeAutomationStudioElementTarget`, which the helper
closure missed because it is an import rather than a local declaration).

**Consumers** —
`npx vitest run src/programs/automation-studio/api src/programs/automation-studio/client-gateway`:
11 files, **43 passed (43)**, exit 0.

**Public method surface** — AST extraction of non-private methods, after every
step of every round:

```
$ diff asfacade-public-before.txt asfacade-public-r3s4.txt
$ echo $?
0
```

**178 names, same order, no diff.**

**Resolved barrel export set** — `checker.getExportsOfModule` for
`runtime/index.ts`, facade vs the pre-work original: **276 exports, identical**.

**Differential probes.** Each drives the pre-extraction class (the committed
`e55a141` `service.ts`, copied in beside the facade for the run) and the facade
side by side and diffs the result; ids, timestamps and temp paths are scrubbed.

| Round | Probe | Observations | Notable coverage |
| --- | --- | --- | --- |
| 1 | paths | 284 | all 41 helpers, every `kind` union expanded, a `/../` project id, rooted and in memory |
| 1 | index stores | 59 | unknown project, empty project, identity mutator, rows appended out of order, re-read |
| 2 | project store | 68 | 16 public calls plus all 8 store methods, durable and memory |
| 2 | legacy store | 54 | the public legacy surface plus all 10 store methods, ending write-locked, both modes |
| 3 | ui cache | 38 | hit, miss, other user, stats, targeted and full delete, six validation errors, unknown project, and `deleteProject` purging the cache — durable and memory |
| 3 | bootstrap adaptations | 24 | memory and stored reads, two flows, ordering, unknown flow and project, recording-provenance rejection — both modes |
| 3 | locks | 8 | serialisation order, independent keys running concurrently, null/undefined project keys, and failure propagation for all three wrappers |
| 3 | object documents | 63 | inline and object-backed documents, asset write/read with digest mismatch and bad media type, dehydrate → hydrate round trip, foreign-project refs, indexed snapshot reads, both delete paths — **in three modes: object store enabled, durable without one, and memory** |
| | **total** | **598** | every one equal |

Samples (scrubbed):

```
locks memory recording.serialises order=start:a,end:a,start:b,end:b,start:c,end:c settled=ok:a|ok:b|ok:c
locks memory recording.independentKeys order=start:a,start:b,end:b,end:a settled=ok:a|ok:b
objects entries.dehydrate => ok [{"type":"observation","observationType":"client.state_snapshot",
  "payload":{"stateRef":"automation-object://project/<uuid>/ff8fb76cfb...
ui-cache durable save.blankKey => throw Automation Studio UI cache entries[0].cacheKey is required.
```

Transcripts at `<scratchpad>/asfacade-round3-transcript.txt` and
`asfacade-objects-transcript.txt` (earlier rounds: `asfacade-index-transcript.txt`,
`asfacade-projects-transcript.txt`, `asfacade-legacy-transcript.txt`). The probes
are kept at `<scratchpad>/asfacade-*-probe.test.ts.kept` and are **not** in the
tree; neither is the baseline copy of `service.ts` they import.

To enable the object store a probe needs both `storageRootDir` and a
`config.json` holding `{ "layoutVersion": 2 }` at the data dir — without it
`createProject` throws "Program document transactions require FluxIQ storage
layout v2". That recipe is in `tests/service.test.ts` and cost time to find twice;
it is written down here so the next probe does not.

**Structure audit** — `node scripts/structure-audit.mjs --rule <id> --json`, after
`git add -N` on everything created:

| Rule | New findings under `runtime/service` |
| --- | --- |
| `imports`, `class-methods`, `file-lines`, `directory-files`, `naming`, `exported-values`, `test-placement` | **0 each**, failures and warnings alike |

Two baseline entries fell and neither rose:

```
class-methods  runtime/service.ts::AutomationStudioService   322  (recorded 339)
file-lines     runtime/service.ts                          11373  (recorded 11839)
```

No collaborator class reaches the 25-method advisory threshold; the largest is
20. `service/` now holds 8 files and 4 subdirectories, against a 15-file advisory
threshold and a 25-file limit.

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` at repository scope.** Not run. The
  package's own `tsc --noEmit` is clean and the audit was run rule by rule.
- **The built `dist/`.** Not rebuilt. The resolved export set is provably
  identical and every collaborator field on the facade is `private`, so
  declaration emit writes `private objectDocuments;` and never names a
  collaborator type.
- **`apps/web` and the downstream extension repository.** Out of scope.
- **Live browser behaviour.** Nothing here is browser-side.
- **The artifact-document object-reference path.** The probe's 200 KB document
  stayed inline in object-store mode, so `AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES`
  is above that; `prepareArtifactDocument`'s reference branch is therefore
  unexercised. The object store itself is covered — the asset write and the state
  snapshot dehydrate both go through it.
- **`pnpm structure:baseline`.** Not run, per the brief.
- **Separate commits.** Each step's input file is preserved so the four steps can
  be replayed or landed separately: `<scratchpad>/asfacade-service-r3-base.ts`
  (at e55a141), then `-step1`, `-step2`, `-step3`, `-step4`. The extraction
  scripts (`asfacade-extract-{uicache,bootstrap,locks,objects}.mjs`) are
  deterministic and each takes the previous step's file as input.

## Open questions or contradictions found

### 1. `projectDatabasePool` is not closed, and the blocker is a cycle, not a layer

Measured, not assumed. The cluster is 20 methods and 538 lines. Eight of them
call into the Flow document layer:

```
getFlowMetadataDetail        -> getFlow
getLlmExecutionBinding       -> getFlow getLlmExecutionDependencyDigest
getFlowGraphViewport         -> getFlow
applyFlowGraphPatch          -> assertFlowGraphMutationAllowed getFlow saveFlowInternal
deleteFlowBootstrapRouter    -> appendProjectMutationChangeFeed getFlowRouter
writeSqlFlowSubflow          -> loadProjectFlow writeProjectFlow
ensureSqlFlowRouterProjection-> getFlowRouter getFlowSubflow
writeSqlFlowRouterProjection -> getFlow
```

The instruction was to extract what it depends on instead. **That layer depends
back on it:**

```
getFlow                      -> materializeCanonicalGraphFlow
getFlowSubflow               -> readSqlFlowSubflow
saveFlowInternal             -> writeSqlFlowMetadata
getLlmExecutionDependencyDigest -> getLlmExecutionGraphRevisionBindings
```

A Flow document writes its SQL projection; the SQL projection reads the Flow
document. Neither side can go first without a callback, which is the residue the
last round removed. **They have to move together, or not at all.**

There is a closed subset — 12 of the 20 methods (280 lines) reach nothing outside
themselves — but taking it would split the SQL projection writers down the middle
(`writeSqlFlowMetadata` leaves, `writeSqlFlowSubflow` stays) and would export
seven helpers back into the facade, two of them generic coercion utilities. I did
not force it. My recommendation is to treat **Flow documents + SQL projections as
one collaborator of roughly 26 methods and 620 lines**, which fits the 40-method
and 800-line limits as a single directory, and to do it as its own dispatch with
a probe built before the cut.

### 2. The prefix table is a starting point, not a partition (accepted; the evidence keeps accumulating)

Over the original 422 names the six groups covered 68% of the methods but only
54% of the code, with 135 methods and 3,769 lines in no group. Round 3 adds three
more counter-examples: `readProjectArtifactList` is a `read*` whose only caller
was the legacy artifact reader; four of the fourteen `ensure*` methods the table
files under "validation" have left for two different collaborators; and
`listProjectHierarchyChildren` / `listProjectChangeFeed` are `list*` methods whose
whole implementation is a project-database query, not retrieval of a document.

### 3. State ownership works, and the map is the handoff

`asfacade-clusters.mjs` (rebuilt this round; it had been cleaned from the repo
root, though the scratchpad copy survived) reports, for each field, the methods
that touch it and the closure of that set. **What is left, measured after step 8:**

| Field(s) | Methods | Public | Lines | Outward calls | Note |
| --- | --- | --- | --- | --- | --- |
| `recordingStateIndexes` | 5 | 1 | 61 | 4 | needs the recording readers first |
| `recordingDomains` | 6 | 6 | 120 | 5 | the recording domain registry |
| `projectDatabasePool` + Flow documents | ~26 | 10 | ~620 | 0 **as a pair** | see 1 — the next real target |
| `objectStore` (remainder) | 15 | 13 | ~520 | — | recording and project deletion flows |
| `repositories` | 48 | 30 | 1,232 | — | the largest remaining cluster |
| `nativeNodeRuntime`, `ioRuntime`, `llmProviderResolver`, `hostRuntime`, `runtimeService`, `runtimeAbortControllers`, `adaptiveRuntimeAdmissions` | 1-13 each | mixed | — | 12-53 | the runtime/LLM side |

Every "outward 0" cluster that existed at the start of this round has now been
taken. What remains needs either a paired extraction (1) or a layer beneath it
extracted first. The storage layer has come apart cleanly; the runtime/LLM side
will not, and `repositories` at 48 methods is the one that will decide whether
`service.ts` can reach the 800-line limit at all.

### 4. The depth ceiling has not bound yet, but the next target may test it

`service/<group>/<file>.ts` is 9 path segments, exactly `LIMITS.maxPathSegments`,
and that rule does not ratchet. Nothing this round needed a third level — the
four new collaborators are flat files in `service/`, which is only 8 segments and
leaves room. The paired Flow-documents/SQL collaborator (~620 lines) also fits as
one directory. `repositories` at 1,232 lines is the first that plausibly wants
`service/<group>/<sub>/<file>.ts`, and per instruction that is a question to bring
back rather than something to flatten into prefixed filenames.

### 5. Two costs worth putting in the plan

- **White-box tests follow private methods.** Relocating a private method breaks
  any test that reaches it or stubs it on the instance. It cost two edits and no
  assertion changes here, and a single grep found every site; at
  `repositories` scale that grep should be run *before* the cut, not after the
  suite fails.
- **Delegation keeps the method count flat.** Seven public methods moved their
  bodies out this round without moving the ratchet. If Phase 7's exit criterion is
  the 40-method limit, the public surface — 178 names — is the floor, and reaching
  it means the facade becomes 178 one-line delegations. That is a decision the
  plan has not yet made explicit.
