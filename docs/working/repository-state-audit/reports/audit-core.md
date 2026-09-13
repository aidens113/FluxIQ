# Report: audit-core

## Outcome

Done. The Core audit found two sensitive-value persistence gaps that should block the Stage 4 leak campaign, one default-storage defect, one already-recorded Flow-routing defect, and stale Current State claims.

## What changed and why

Only this report was added. No source, test, generated, runtime, shared working-document, commit, or remote state was intentionally changed. A probe triggered the default-storage defect and created `F:\!FluxIQ\indexes\` and `F:\!FluxIQ\recordings\`; every probe-created file and empty directory was removed immediately after its paths were verified.

## Findings

### 1. Critical: caller-withheld values remain in persisted runtime result objects

- Evidence: `packages/fluxiq/src/runtime/service.ts:430-436` rewrites only `result.message` and `result.error`. The result contract also permits `payload`, `target`, `failure`, and `metadata` (`packages/fluxiq/src/runtime/contracts.ts:82-93`), and `settleAttempt` stores that partially rewritten result on the command attempt (`service.ts:278-285`).
- Executable proof against the current built package: an adapter returned the sentinel in `payload.echo`, `target.label`, and `metadata.note`. The saved in-memory attempt contained `"commandText":"[withheld]"` but retained the sentinel in all three result fields.
- Compatibility impact: any downstream adapter/client that echoes or annotates a state-resolved credential can place it in the runtime command-attempt store even though the Automation Studio trace is sanitized. This directly invalidates a broad claim that resolved values are withheld at rest and must be repaired before the planned auth/upload/sensitive-input SQLite scan can close.
- Missing coverage: `packages/fluxiq/src/runtime/tests/service.test.ts` proves only command parameters plus result `message`/`error`; it never supplies a sensitive result payload, target, failure detail, or metadata.

### 2. Critical: an unbound run input copied to an output remains in the saved Automation Studio trace

- Evidence: `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts:91-103` explicitly records the gap; `withholdRunInputs` at lines 105-116 rewrites only top-level `values`/attempt-input entries whose key and identity still match the caller input. It does not add input scalars to the value-based withholding set.
- Executable proof against the current built package: a custom node read `inputs.secret` and returned it as `outputs.echo` without a `$state` binding. The saved trace withheld `attempt.inputs.secret`, but retained the sentinel in `attempt.outputs.echo`, `values.echo`, and `values["n.echo"]`.
- Compatibility impact: imported/native nodes and composite behavior can legitimately copy a run input under another output key. A downstream secret supplied as a run input can therefore survive in persisted run details and SQLite despite the Week 1 wording "run inputs ... withheld at rest." Stage 4 must include an echo/copy case, not only direct bound parameters.

### 3. High: `AutomationStudioService()` without a storage root both forgets projects and writes project recording files into the process working directory

- Evidence: the constructor leaves `projectRootDir` undefined unless `dataDir` or `storageRootDir` is supplied (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts:700-725`). `AutomationStudioProjectStore.writeProjectIndex` applies a mutator to a fresh empty object and discards it when no index store exists (`runtime/service/projects/store.ts:21-30`), while `AutomationStudioProjectPaths.projectDirectory` returns `""` and `projectFile` joins child paths onto it (`runtime/service/paths/project.ts:11-18`). Recording persistence does not guard that absent root (`runtime/service.ts:5364-5379`).
- Executable proof: creating a project through a default service returned an id, but `listProjects()` immediately reported zero projects. Attempting to create a project-scoped recording then wrote `indexes/pipeline.json` and recording documents below the repository working directory before failing with `Unknown Automation Studio project`.
- Compatibility impact: downstream production appears to inject durable storage, so this is not necessarily a Week 1 Lab blocker. It does affect direct consumers, default service tests, and any host that assumes the optional storage settings select a safe in-memory mode. The operation also fails non-atomically after leaving partial files.

### 4. Medium: the public `failureRoute` action parameter is ignored

- Evidence: `packages/fluxiq/src/programs/automation-studio/nodes/policy/action.ts:23,40` exposes and emits `failureRoute`, but both IO dispatch paths create failures through `failedDispatchResult`, which hard-codes route `failed` (`runtime/io-policy.ts:52,116,177-189`). The regression test itself documents that no failure reads the setting (`runtime/executor/tests/node-execution.test.ts:263-267`).
- Compatibility impact: a downstream Flow that configures an alternate failure route will follow `failed` or stop instead. This is already listed as deferred in Current State, but it is a concrete product defect rather than an unverified risk.

### 5. Documentation contradictions

- `docs/working/mvp-week1-web-automation-reliability-plan.md:23-24` says the branch is three commits ahead and unpushed, while line 67 says both branches are pushed; the repository is actually aligned with `origin/dev` at `0a2dc53`.
- The same Current State still says proposal approval drops `expectedState` (line 96), but `runtime/service/recordings/proposal-candidates.ts:88-106` copies it to `parameterValues.expectedState`, and its focused tests pass. That open item is resolved and should be removed.
- The no-`dataDir` working-directory warning (lines 99-100) is still true and is worse than phrased because the same mode also forgets the created project and can leave partial artifacts.

## Commands run and observed results

- `pnpm --filter fluxiq exec vitest run src/runtime/tests/service.test.ts src/programs/automation-studio/runtime/executor/tests/trace-withholding.test.ts src/programs/automation-studio/runtime/executor/tests/node-execution.test.ts src/programs/automation-studio/runtime/service/recordings/tests/proposal-candidates.test.ts --no-file-parallelism` (from `packages/fluxiq`) -> 4 files passed, 49 tests passed, duration 9.41s.
- Runtime-result withholding probe via `node --input-type=module -e ...` importing `packages/fluxiq/dist/runtime/index.js` -> command parameter was `[withheld]`; result payload, target, and metadata retained `AUDIT_SENTINEL`.
- Graph-trace withholding probe via `node --input-type=module -e ...` importing the built Automation Studio package -> input was `[withheld]`; attempt output and both value copies retained `AUDIT_SENTINEL`.
- Default-service probe via `node --input-type=module -e ...` -> `createProject` returned an id and immediate `listProjects()` returned `0`; a recording attempt created root-relative files then failed `Unknown Automation Studio project`. Probe artifacts were enumerated and removed.
- `git status --short --branch` at intake -> `dev...origin/dev`; only supervisor-owned audit/index documentation changes were present. After cleanup, `git status --short` again showed only those same documentation paths.

## Not verified

- No full Core suite, build, package lint, SQLite leak scan, downstream Lab run, or browser run was performed.
- I did not prove whether current downstream actions actually echo sensitive values into every affected result field; the contracts and persistence path permit it, and the generic executable probe proves Core does not prevent it.
- I did not audit unrelated historical Automation Studio areas or attempt repairs.

## Open questions or contradictions found

- Should all runtime result data fields be value-withheld, or should the runtime command-result contract designate a smaller persistable diagnostic projection?
- Should unbound run inputs be categorically treated as sensitive for the entire saved trace, including copies in outputs/effects/prose?
- Is a storage-less `AutomationStudioService` intended to be fully in-memory? The optional option types and memory repositories imply yes, but current project storage behaves otherwise.
