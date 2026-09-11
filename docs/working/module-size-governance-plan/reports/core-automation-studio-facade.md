# Report: core-automation-studio-facade (Phase 7, the centrepiece)

## Outcome

Done — **four collaborators** extracted across two dispatches (two per
instruction), stopped there both times.

`packages/fluxiq/src/programs/automation-studio/runtime/service.ts` went from
**12,482 lines to 11,839** and `AutomationStudioService` from **422 methods to
339**. The 178 public method names are identical, in the same order, after every
step, and the resolved export set of `runtime/index.ts` is the same 276 names,
proved by a TypeScript-checker diff against the pre-work file. Four differential
probes drove the pre-extraction implementation and the facade side by side over
**465 observations** and found no difference.

| Step | Collaborator | Methods moved | `service.ts` | Class |
| --- | --- | --- | --- | --- |
| 1 | `service/paths/` | 41 | 12,482 → 12,048 | 422 → 381 |
| 2 | `service/indexes/` | 20 | 12,048 → 11,952 | 381 → 361 |
| 3 | `service/projects/` | 12 | 11,952 → 11,952 | 361 → 349 |
| 4 | `service/legacy/` | 10 | 11,952 → 11,839 | 349 → 339 |

(Steps 2 to 4 also removed type declarations and module helpers, which is why the
line count does not move in step with the method bodies alone.)

All four are slices of the **persistence** group the brief named first, taken
innermost-first so each step landed on top of the one below it and nothing above
it moved. The residue the first dispatch left behind is gone: `projectRootDir`
now has exactly one owner, and the `requireProject` callback has dissolved.

## What changed and why

### The four collaborators

| File | Class / exported values | Methods | Lines | Owns |
| --- | --- | --- | --- | --- |
| `service/paths/project.ts` | `AutomationStudioProjectPaths`, `projectArtifactDocumentFileName` | 12 | 70 | the storage root and every path under a project |
| `service/paths/flow.ts` | `AutomationStudioFlowPaths` | 20 | 89 | every path under one Flow |
| `service/paths/recording.ts` | `AutomationStudioRecordingPaths` | 9 | 56 | every path under one recording session |
| `service/indexes/store.ts` | `AutomationStudioServiceIndexes` + 3 empty-index constructors | 20 | 184 | the nine per-project JSON indexes |
| `service/indexes/types.ts` | — (types only) | — | 121 | the index shapes and the six public summary types |
| `service/projects/store.ts` | `AutomationStudioProjectStore`, `normalizeProjectCategories` | 12 | 111 | the project catalogue, the legacy-store migration, storage readiness |
| `service/projects/types.ts` | — (types only) | — | 10 | `AutomationStudioProjectRecord`, `AutomationStudioProjectIndex` |
| `service/legacy/store.ts` | `AutomationStudioLegacyRetirementStore`, `legacyDiagnostic`, `legacyArtifactsDigest` | 10 | 136 | retirement state, audit trail, source backups, legacy artifact reads |
| `service/stable-json.ts` | `stableJson` | — | 7 | deterministic JSON for digests |
| five barrels (`service/index.ts` + one per group) | — | — | 13 | barrels |

83 methods moved; 797 lines of collaborator against 643 removed from
`service.ts`, so the whole transformation so far costs **+154 lines, +1.2%**.
(The `ClientGatewayService` pilot measured +87% on code lines at 636 lines. The
overhead is per collaborator — a constructor, a field list, an import block —
not per method, so it amortises exactly as that report predicted.)

### Steps 1 and 2 — `service/paths/` and `service/indexes/`

The 41 `*File` / `*Directory` / `*Folder` helpers were a **perfectly closed set**:
the only name any of the 41 bodies reaches that is not in the set is the field
`projectRootDir`. They are pure, synchronous and total 138 lines. Split three
ways because one class of 41 would exceed the 40-method limit; at 12, 20 and 9
none reaches the 25-method advisory threshold.

The index store is the nine per-project JSON indexes (flows, recordings, routers,
subflows, instructions, change proposals, runs, adaptations, adaptation policies)
plus the read-only runtime and pipeline indexes — uniform three-line methods:
resolve the project, open a `ProgramJsonStore` at a path, read or update through
a sort function. Its 14 `empty*Index` / `sort*Index` helpers moved with it and
only the three still used by methods that stayed behind are exported. The nine
index types moved to `types.ts`, and with them the six **public** summary types
they are built from, which `service.ts` re-exports by name so its own export list
and the runtime barrel are unchanged.

### Step 3 — `service/projects/`, and the residue it removed

The project store was taken first this dispatch because the coordinator asked for
the residue, and because it is **fully closed on methods**: an AST scan of all
twelve bodies returns *zero* calls to anything still on the facade. It needed
only fields.

Both pieces of residue named in the previous report are gone:

- **`projectRootDir` was stored twice** — once on the facade (63 methods test it
  as "is there durable storage?") and once as `AutomationStudioProjectPaths.root`.
  The field is deleted; the constructor keeps the value in a local, hands it to
  `AutomationStudioProjectPaths`, and all 64 remaining reads go through
  `this.projectPaths.root`. One owner, no copy.
- **The `requireProject` callback** injected into the index store in step 2 was a
  stand-in for `findProject`, which lived on the half-migrated facade.
  `findProject` is now a project-store method, so `AutomationStudioServiceIndexes`
  takes the project store itself and the callback is deleted.

`ProgramJsonStore` construction for the project index and the legacy project
store moved into the collaborator's constructor, gated on `paths.root` and on a
`legacyDataDir` argument — provably the same two conditions the facade used
(`projectIndexStore` existed iff `projectRootDir` was set, `legacyProjectStore`
iff `options.dataDir`, and the latter implies the former). Five facade methods
still open transactions on that store directly; they now reach it as
`this.projects.indexStore`, a public readonly field on the collaborator. That is
deliberate: moving those five public methods is a separate step, and reaching the
store through its owner is honest about where it lives.

### Step 4 — `service/legacy/`

The legacy Task/Routine retirement subsystem: retirement state, audit trail,
source backups, and the cached reader for legacy artifact folders. Chosen by the
mechanical clustering described below — it owns **four fields nothing else
touches** (`memoryLegacyRetirementStates`, `memoryLegacyBackups`,
`memoryLegacyAudit`, `legacyProjectArtifactReads`) and, once
`readProjectArtifactList` is included, has **zero outward method calls**.

Including `readProjectArtifactList` is worth a note, because it is a small proof
of finding 1. By name it is a `read*` persistence method and the plan's table
would file it with the other 27. By use it has **exactly one caller in the whole
class** — `readLegacyProjectArtifactsUncached` — so it is legacy-only, and moving
it is what makes the cluster closed. The verb was not the responsibility.

The three public methods that front this subsystem (`inspectLegacyRetirement`,
`verifyLegacyBackup`, `planFlowMigrationRollback`) stay on the facade: they also
reach `repositories`, `getFlow`, `listCanonicalFlowArtifacts` and
`inspectFlowMigration`, so they are not legacy-only. They call into the
collaborator like any other consumer.

One new shared module was needed. `legacyArtifactsDigest` moved with the store
and calls `stableJson`, which 13 other places in `service.ts` also use. Rather
than a callback, a duplicate, or a cycle back into `service.ts`, `stableJson`
moved to `service/stable-json.ts` and both import it. It is the first neutral
helper module under `service/`, and the pattern to reuse when a helper is shared
rather than owned.

### How collaborators 3 and 4 were chosen

The previous report recommended deriving the graph mechanically instead of by
reading. That is now done, and it is the reusable part of this work
(`<scratchpad>/asfacade-clusters.mjs`): for every remaining field it lists the
methods that touch it, then reports how many methods *outside* that set those
methods call. A low outward count means extractable; a high one means not yet.
Both of this dispatch's collaborators scored **0**.

### What was deliberately not done

- **`tests/service.test.ts` was not split.** It never names any of the 83
  extracted methods (checked by name for each); every test drives the public
  facade. There is nothing to move yet, and the plan says never to split ahead of
  the collaborators. The four differential probes are the direct coverage.
- **`runtime/index.ts` was not touched.** The collaborators are private to
  `runtime/service/`; the barrel does not export them.
- **No baseline regeneration**, per the brief.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime --reporter=basic`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Before any change | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| After step 1 | 32 (2 failed) | 400 (3 failed) | the same three |
| After step 2 | 32 (2 failed) | 400 (3 failed) | the same three |
| After step 2, final run | 32 (2 failed) | 400 (**4** failed) | the same three plus a second pagination case |
| After step 4 | 32 (2 failed) | 400 (3 failed) | the same three |

The fourth failure that appeared once was chased rather than assumed flaky,
because step 2 touches the subflow index path: that file passes 5/5 three times
in isolation, and `service.ts` swapped back to the pre-work original with the
rest of the tree untouched reproduces **the identical 4 failures**. It is
load-dependent, and the tree was busy (another worker landed an `executor/` split
mid-run). The final run is back to the original 3.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, no output,
before the work and after each of the four steps. Two intermediate runs reported
errors in `runtime/executor/graph-run.ts` and later in `api/handlers/tests/*` —
both other workers' in-flight splits, both naming only their own files, and the
executor one was gone on the next run. No error has ever named `runtime/service`.

**Consumers** —
`npx vitest run src/programs/automation-studio/api src/programs/automation-studio/client-gateway`:
**43 passed (43)**, exit 0, after step 2 (2 files) and after step 4 (11 files —
the api worker split its tests in between; the case count is unchanged).

**Public method surface** — AST extraction of non-private methods, before vs
after each step:

```
$ diff asfacade-public-before.txt asfacade-public-step4.txt
$ echo $?
0
```

**178 names, same order, no diff.** `service.ts`'s own export list (55 entries)
is also unchanged; the six summary types that moved in step 2 are restored by a
named re-export.

**Resolved barrel export set** — `checker.getExportsOfModule` for
`runtime/index.ts`, with the facade in place and then with `service.ts` reverted
to the pre-work original:

```
exports: 276   (facade, after step 4)
exports: 276   (pre-work original)
$ diff asfacade-barrel-orig.txt asfacade-barrel-step4.txt
$ echo $?
0
```

**Differential probes.** Each drives the pre-extraction class and the facade side
by side and diffs the result; ids, timestamps and temp paths are scrubbed so only
behaviour is compared.

| Probe | Observations | Covers |
| --- | --- | --- |
| paths | 284 | all 41 helpers, every `kind` union expanded, a `/../` project id, rooted and in memory |
| index stores | 59 | every read and write against an unknown project, on an empty project, with an identity mutator, appending rows out of order, then re-read |
| project store | 68 | 16 public calls (`listProjects`, `createProjectCategory` x2, `createProject`, `updateProject`, `getProjectHierarchy`, `saveProjectHierarchy`, `listProjectHierarchyChildren`, `listRuntimeSessionSummaries`, `listRecordingSummaries`, `listProjectChangeFeed`, `listFlowSubflowSummaries`, `snapshot`, unknown-project, `deleteProject`) plus all 8 store methods with valid and unknown arguments — **in both durable and memory mode**, which is what exercises the `projectRootDir` collapse |
| legacy store | 54 | the public legacy surface (`saveProjectArtifact`, `listProjectArtifacts`, `legacyEndpointDiagnostic`, `inspectLegacyRetirement`, `recordLegacyRetirementEvidence`, `exportLegacyProject` twice, `listLegacyRetirementAudit`, `sealLegacyWrites`) plus all 10 store methods, ending with a write-locked project — in both modes |
| **total** | **465** | every one equal |

Samples from the transcripts (scrubbed):

```
append writeFlowInstructionIndex => ok {"schemaVersion":"0.1","summaryVersion":2,
  "instructions":[{"instructionId":"c-row","updatedAt":9},
                  {"instructionId":"a-row","updatedAt":5},
                  {"instructionId":"b-row","updatedAt":5}...
durable exportLegacyProject => ok {"schemaVersion":"0.1","backupId":"legacy-source.<uuid>",
  "projectId":"<uuid>","digest":"<hex>","artifacts":{"tasks":[{"taskId":"task-1"...
durable saveProjectArtifact.locked => throw Legacy Task/Routine writes are disabled for
  this Flow-first project. Use canonical Flow APIs.
memory updateProject => throw Unknown Automation Studio project: <uuid>
```

Transcripts at `<scratchpad>/asfacade-index-transcript.txt`,
`asfacade-projects-transcript.txt` and `asfacade-legacy-transcript.txt`. The
probes are kept at `<scratchpad>/asfacade-*-probe.test.ts.kept` and are **not** in
the tree; neither is the baseline copy of `service.ts` they import.

**Structure audit** — `node scripts/structure-audit.mjs --rule <id> --json`,
after `git add -N` on everything created:

| Rule | New findings under `runtime/service` |
| --- | --- |
| `imports`, `class-methods`, `file-lines`, `directory-files`, `naming`, `exported-values`, `test-placement` | **0 each**, failures and warnings alike |

Two baseline entries fell and neither rose:

```
class-methods  runtime/service.ts::AutomationStudioService  339  (recorded 422)
file-lines     runtime/service.ts                         11839  (recorded 12482)
```

No collaborator class reaches the 25-method advisory threshold; the largest is
20. The `imports` rule confirms the generalised exemption works for
`service/<group>/x.ts` importing `runtime`'s own files, and the sibling rule was
respected: `service/indexes/store.ts` imports `../paths/index.ts` and
`../projects/index.ts`, the barrels, never a sibling's file.

`service.ts` reports 1 barrel-skipping import against a recorded 2. **That is not
mine**: its relative-import set is byte-identical before and after (diffed), and
the drop is because another worker turned `automation-studio/api/contracts.ts`
into a directory, which the rule exempts.

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` at repository scope.** Not run —
  several workers are editing this tree concurrently and `packages/fluxiq/dist`
  is being rebuilt by others. The package's own `tsc --noEmit` is clean and the
  audit was run rule by rule.
- **The built `dist/`.** Not rebuilt. The declaration surface comes from an
  unchanged barrel and the resolved export set is provably identical; every
  collaborator field on the facade is `private`, so declaration emit writes
  `private projects;` and never names a collaborator type.
- **`apps/web` and the downstream extension repository.** Out of scope.
- **Live browser behaviour.** Nothing here is browser-side.
- **The remaining collaborators.** Not attempted, per the brief.
- **`pnpm structure:baseline`.** Not run, per the brief.
- **Separate commits.** A worker cannot commit, so all four steps sit in one
  working tree. Each step's input file is preserved so they can be replayed or
  landed separately: `<scratchpad>/asfacade-service-orig.ts` (pre-work), then
  `asfacade-service-step1.ts`, `asfacade-service-step2-final.ts`,
  `asfacade-service-step3.ts`, `asfacade-service-step4.ts`. The four extraction
  scripts (`asfacade-extract-{paths,indexes,projects,legacy}.mjs`) are
  deterministic and each takes the previous step's file as input — step 4 was
  regenerated from step 3 once during this session, byte for byte, to prove it.

## Open questions or contradictions found

### 1. The prefix table is a starting point, not a partition (accepted, restated with the new evidence)

Measured over all 422 original method names: the six groups cover 68% of the
methods but only **54% of the code**; 135 methods and 3,769 lines are in no group,
and they are the *large* ones (28 lines each on average against 15 for the named
groups), 67 of them public. Persistence is 115 methods / 1,629 lines and
retrieval 84 / 1,446 — each beyond the 40-method and 800-line limits on its own,
so each is a directory, not a file. Both dispatches built them that way.

Two further datapoints from this dispatch:

- **`readProjectArtifactList`** is a `read*` method whose only caller among 422
  is the legacy artifact reader (above).
- **The `ensure*` prefix does not hold either.** The plan files `ensure` 14 under
  "validation". Of those, `ensureStorageReady`, `ensureProjectStructure` and
  `ensureNodeLibraryStructure` are project-storage lifecycle and moved with the
  project store; `ensureLegacyBackup` is a legacy-retirement write and moved with
  that store. Four of fourteen have already left "validation" for two different
  collaborators, before anyone has looked at the group.

### 2. State ownership works, and it is now mechanical — here is the map for whoever continues

`asfacade-clusters.mjs` reports, for each field, the methods that touch it and
the closure of that set. **Remaining clusters, measured after step 4:**

| Field(s) | Methods | Public | Lines | Outward calls | Note |
| --- | --- | --- | --- | --- | --- |
| `uiCacheStore` | 6 | 6 | 66 | 0 | 4 are UI-cache-only; `close` and `deleteProject` also touch other state |
| `memoryBootstrapAdaptations` | 4 | 1 | 80 | 0 | flow-bootstrap adaptations held in memory |
| `recordingMutationLocks`, `bootstrapAdaptationLocks`, `bootstrapGenerationLocks` | 1 each | 0 | 47 | 0 | three `with*Lock` wrappers; one small "locks" collaborator |
| `recordingStateIndexes` | 5 | 1 | 61 | 4 | needs the recording readers first |
| `recordingDomains` | 6 | 6 | 120 | 5 | the recording domain registry |
| `projectDatabasePool` | 20 | 7 | 538 | — | the SQL projections |
| `objectStore` | 28 | 13 | 673 | — | **the next big persistence chunk**: artifact documents, object assets, pruning |
| `repositories` | 48 | 30 | 1,232 | — | the canonical repositories; the largest remaining cluster |
| `nativeNodeRuntime`, `ioRuntime`, `llmProviderResolver`, `hostRuntime`, `runtimeService`, `runtimeAbortControllers` | 2-13 each | mixed | — | 12-25 | the runtime/LLM side, heavily interconnected |

The honest read: the storage layer is coming apart cleanly and the runtime/LLM
side will not. Four of the five "outward 0" clusters left are small (1-6
methods). After them the next real steps are `objectStore` (28) and
`repositories` (48), and neither is closed today — each will need what this
dispatch did, extracting the layer beneath first so the outward count falls to
zero before the cut is made.

### 3. The depth ceiling, confirmed again

`service/legacy/store.ts` and `service/projects/store.ts` are 9 path segments,
exactly `LIMITS.maxPathSegments`, and that rule does **not** ratchet. There is no
room for `service/<group>/<sub>/<file>.ts`. No group has needed it so far —
`paths/` is three files, `indexes/` and `projects/` two each plus a barrel — but
`objectStore` (28 methods, 673 lines) and `repositories` (48, 1,232) are the two
that might, and per the coordinator's instruction that is a question to bring
back rather than something to flatten into prefixed filenames.

### 4. Line endings: a scare, not a problem

`service.ts` was already mixed before this work (10,446 CRLF lines and 2,036
LF-only). A Python text-mode rewrite during step 2 normalised the whole file to
CRLF, and I later normalised every file I own to LF. **None of it shows in git**:
`core.autocrlf=true` and there is no `.gitattributes`, so the index holds LF
either way and `git diff --numstat` was identical before and after the
normalisation. Flagged only so a reviewer running a raw byte diff is not
surprised.

### 5. Working conditions worth knowing

Three other workers were editing `packages/fluxiq` during this dispatch
(`runtime/executor/`, `api/handlers/`, and an earlier `runtime/` prefix split).
Their in-flight states produced transient `tsc` errors in *their* files twice and
changed the consumer test file count from 2 to 11 between my two runs. Anything
measured on a shared tree needs its before-state re-measured on the same tree —
as the fourth-failure investigation above shows, that is the difference between
reporting a regression and reporting the truth.
