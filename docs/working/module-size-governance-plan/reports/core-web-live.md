# core-web-live — Phase 4, `apps/web/src/features/automation-studio/live/`

## Outcome

**Done.** `live/` went from 36 direct source files to **6**, matching the
worked example in `docs/architecture/code-structure.md` exactly: 6 loose,
`components/` 7, `hooks/` 19, `commands/` 4, plus the existing `view-host/`.
Every moved file's test moved into the matching new `tests/` folder.

- **Export surface:** 108 symbols, `diff` **IDENTICAL** before and after.
- **`tsc --noEmit` in `apps/web`: exit 0, no output.**
- **`vitest run src/features/automation-studio/live`: 17 files / 97 cases,
  all passing** — same counts as before the split, and now fully green.
- **Barrel-skipping imports *inside* `live/`: zero.** Three genuine crossings
  existed and are fixed. The 17 remaining `imports` failures every one point
  *outside* `live/`; named list and reasons below.

## Layout before and after

| Directory | Source files | Tests |
| --- | --- | --- |
| `live/` (loose) | 36 → **6** | 13 → 6 |
| `live/components/` | new → **7** + `index.ts` | new → 3 |
| `live/hooks/` | new → **19** + `index.ts` | new → 3 |
| `live/commands/` | new → **4** + `index.ts` | new → 1 |
| `live/view-host/` | 7 unchanged | 4 unchanged |

The six that stay loose are the six the plan names:
`active-workspace-selection.ts`, `command-scope.ts`,
`flow-editor-view-recovery.ts`, `session-project-view.ts`,
`view-state-references.ts`, `workspace-view-registration.ts`.

## The imports-rule gate

### Three crossings inside `live/` — found and fixed

Only one file reached into a sibling subdirectory of `live/`:
`components/AutomationStudioSession.tsx` imported three `view-host/` files
directly.

```text
before:  ../view-host/canonical-connected-views      (type AutomationCanonicalConnectorScope)
         ../view-host/connected-view-entries         (useAutomationConnectedViewEntries, useAutomationConnectedViewSource)
         ../view-host/useAutomationConnectorCommands (useAutomationConnectorCommands)

after:   ../view-host                                (all four symbols, one import)
```

`view-host/index.ts` did not export any of them, so I widened it by exactly
those four. This is the sanctioned widening case: both sides are inside
`live/`, the barrel is mine, and all four are part of the view host's real
public surface — `AutomationStudioSession` is the view host's principal
consumer, not a special case reaching past it for a private helper. Session's
skip count went **6 → 3**; total counted specifiers under `live/` went
**28 → 25**.

An enumerator that replicates the rule's logic over every tracked file under
`live/` now reports **no crossing whose target is inside `live/`**.

### The 17 remaining failures, and why I left them

Every one of the 25 remaining counted specifiers resolves into a *different
feature* under `automation-studio/`, not into a `live/` subdirectory. Grouped
by target:

| Target directory | Specifiers | Example |
| --- | --- | --- |
| `automation-studio/views/` | 15 | `../../views/view-registry` |
| `automation-studio/project/` | 4 | `../../project/project-api` |
| `automation-studio/sync/` | 2 | `../../sync/useAutomationProjectDataPlatform` |
| `automation-studio/stores/` | 2 | `../../stores/external-store` |
| `automation-studio/problems/` | 1 | `../../problems/problem-queries` |
| `automation-studio/flow-editor/` | 1 | `../../flow-editor/flow-editor-types` |

The 17 files: `commands/{domain,recording-domain,state-domain}-commands.ts`;
`components/{AutomationHierarchySurface, AutomationStudioComposition,
AutomationStudioConnectedRegions, AutomationStudioSession,
AutomationStudioWorkspaceComposition}`;
`components/tests/{AutomationHierarchySurface.selection, AutomationStudioProjectGate}`;
`hooks/tests/project-opening-hydration-revision`;
`hooks/{useAdaptationWorkspaceNavigation, useAutomationGraphRuntime,
useAutomationHierarchyCommandBridge, useAutomationSelectionNavigation,
useAutomationSessionDirtyGuards, useAutomationWorkspaceRuntime}`.

I left all of them, for three reasons:

1. **They are not new.** Each is the identical violation at a new key. I
   checked every one against its pre-move baseline value mechanically, not by
   eye (table below): every count matches, and the only count that changed is
   Session's, which I *lowered*.
2. **They cannot be fixed from inside `live/`.** Resolving
   `../../views/view-registry` means widening `views/index.ts` to export the
   view registry, and likewise for `stores/`, `project/`, `sync/`,
   `problems/`, `flow-editor/`. Those barrels are not mine, `flow-editor/` is
   concurrently owned, and the change is cross-feature, not cross-directory.
3. **They are the plan's existing, frozen debt.** `Current State` records 325
   barrel-skipping imports repository-wide, "essentially unchanged from 326",
   and `views/view-registry` is imported this way from all over
   `automation-studio/`, not just from `live/`. Repointing them is a
   deliberate separate exercise, not a side effect of a kind split.

**A correction to the diagnosis in the dispatch.** The message describes the
cause as "`live/use-x.ts` importing `./component-y.tsx` was a same-directory
import and exempt; after the split `live/hooks/use-x.ts` importing
`../components/y.tsx` is a crossing." That shape does not occur anywhere in
this result. Every intra-`live/` crossing the split could have created was
routed through a kind barrel (`../hooks`, `../commands`, `../components`) as
the files were moved, so the split created **zero** new violations of that
kind. The 17 failures surfaced because the *files moved*, changing their
baseline keys, not because their imports changed.

## Complete old → new path mapping

All paths repository-relative; prefix each with
`apps/web/src/features/automation-studio/`. 37 renames: 30 source, 7 tests,
all via `git mv` so history follows.

### To `live/commands/`

```text
live/domain-commands.ts                       -> live/commands/domain-commands.ts
live/recording-domain-commands.ts             -> live/commands/recording-domain-commands.ts
live/session-store-commands.ts                -> live/commands/session-store-commands.ts
live/state-domain-commands.ts                 -> live/commands/state-domain-commands.ts
live/tests/domain-commands.test.ts            -> live/commands/tests/domain-commands.test.ts
```

### To `live/components/`

```text
live/AutomationHierarchySurface.tsx           -> live/components/AutomationHierarchySurface.tsx
live/AutomationStudioComposition.tsx          -> live/components/AutomationStudioComposition.tsx
live/AutomationStudioConnectedRegions.tsx     -> live/components/AutomationStudioConnectedRegions.tsx
live/AutomationStudioProjectGate.tsx          -> live/components/AutomationStudioProjectGate.tsx
live/AutomationStudioSession.tsx              -> live/components/AutomationStudioSession.tsx
live/AutomationStudioWorkspaceComposition.tsx -> live/components/AutomationStudioWorkspaceComposition.tsx
live/AutomationStudioWorkspaceSurface.tsx     -> live/components/AutomationStudioWorkspaceSurface.tsx
live/tests/AutomationHierarchySurface.selection.test.tsx -> live/components/tests/AutomationHierarchySurface.selection.test.tsx
live/tests/AutomationHierarchySurface.test.ts -> live/components/tests/AutomationHierarchySurface.test.ts
live/tests/AutomationStudioProjectGate.test.tsx -> live/components/tests/AutomationStudioProjectGate.test.tsx
```

### To `live/hooks/`

```text
live/use-gateway-recording-bridge.ts          -> live/hooks/useGatewayRecordingBridge.ts   (RENAMED)
live/useActiveWorkspaceSelectionSync.ts       -> live/hooks/useActiveWorkspaceSelectionSync.ts
live/useAdaptationWorkspaceNavigation.ts      -> live/hooks/useAdaptationWorkspaceNavigation.ts
live/useAutomationBrowserEntry.ts             -> live/hooks/useAutomationBrowserEntry.ts
live/useAutomationConnectedRegionSurfaces.tsx -> live/hooks/useAutomationConnectedRegionSurfaces.tsx
live/useAutomationDeepLinkRuntime.ts          -> live/hooks/useAutomationDeepLinkRuntime.ts
live/useAutomationExternalLifecycle.ts        -> live/hooks/useAutomationExternalLifecycle.ts
live/useAutomationGraphRuntime.ts             -> live/hooks/useAutomationGraphRuntime.ts
live/useAutomationHierarchyBrowserPaging.ts   -> live/hooks/useAutomationHierarchyBrowserPaging.ts
live/useAutomationHierarchyCommandBridge.ts   -> live/hooks/useAutomationHierarchyCommandBridge.ts
live/useAutomationHierarchyUiRuntime.ts       -> live/hooks/useAutomationHierarchyUiRuntime.ts
live/useAutomationProjectRuntime.ts           -> live/hooks/useAutomationProjectRuntime.ts
live/useAutomationRecordingCommands.ts        -> live/hooks/useAutomationRecordingCommands.ts
live/useAutomationSelectionNavigation.ts      -> live/hooks/useAutomationSelectionNavigation.ts
live/useAutomationSessionDirtyGuards.ts       -> live/hooks/useAutomationSessionDirtyGuards.ts
live/useAutomationStudioFoundation.ts         -> live/hooks/useAutomationStudioFoundation.ts
live/useAutomationStudioLiveOverlays.ts       -> live/hooks/useAutomationStudioLiveOverlays.ts
live/useAutomationWorkspaceRuntime.ts         -> live/hooks/useAutomationWorkspaceRuntime.ts
live/useStableAutomationEvent.ts              -> live/hooks/useStableAutomationEvent.ts
live/tests/project-opening-hydration-revision.test.tsx -> live/hooks/tests/project-opening-hydration-revision.test.tsx
live/tests/useAutomationSessionDirtyGuards.test.ts -> live/hooks/tests/useAutomationSessionDirtyGuards.test.ts
live/tests/useAutomationStudioLiveOverlays.test.ts -> live/hooks/tests/useAutomationStudioLiveOverlays.test.ts
```

### Unmoved — do not repoint these

`live/active-workspace-selection.ts`, `live/command-scope.ts`,
`live/flow-editor-view-recovery.ts`, `live/session-project-view.ts`,
`live/view-state-references.ts`, `live/workspace-view-registration.ts`;
everything under `live/view-host/`; and the six tests still in `live/tests/`:
`automation-studio-live-ownership.test.ts`, `flow-editor-view-recovery.test.ts`,
`restored-workspace-selection.test.ts`, `session-project-view.test.ts`,
`view-state-references.test.ts`, `workspace-view-registration.test.ts`.

### One caveat when repointing

`use-gateway-recording-bridge.ts` → `useGatewayRecordingBridge.ts` is a **file**
rename only. Its export is still `useAutomationGatewayRecordingBridge`,
untouched.

## Files changed outside the mapping

Four new/edited barrels, all `git add -N`'d so the audit can see them:
`live/commands/index.ts`, `live/components/index.ts`, `live/hooks/index.ts`
(new), and `live/view-host/index.ts` (widened by four symbols, above).

Five in-place edits inside `live/**`:

- `live/components/AutomationStudioSession.tsx` — three `view-host/` file
  imports collapsed into one `../view-host` barrel import.
- `live/tests/automation-studio-live-ownership.test.ts` — 15 `read("…")` path
  literals repointed.
- `live/view-host/tests/direct-view-connector.test.ts:54` —
  `"../../AutomationStudioSession.tsx"` → `"../../components/AutomationStudioSession.tsx"`.
  Easy to miss: two levels up, not one.
- `live/view-host/useAutomationConnectorCommands.ts:5` —
  `"../useStableAutomationEvent"` → `"../hooks"`.
- `live/tests/restored-workspace-selection.test.ts` —
  `"../useAutomationProjectRuntime"` → `"../hooks"`.

**One edit outside `live/**`, deliberate.**

`apps/web/src/features/automation-studio/AutomationStudioLive.tsx:3`

```diff
-export { AutomationStudioComposition as AutomationStudioLive } from "./live/AutomationStudioComposition";
+export { AutomationStudioComposition as AutomationStudioLive } from "./live/components";
```

This was the pair of type errors a finished worker reported, and it was not
mid-move — it was the real break. The chain: this three-line file is the only
real *import* from outside `live/` into `live/`; `ProgramLiveViews.tsx:8` loads
it via `dynamic(() => import(…).then(m => m.AutomationStudioLive))`, so once the
re-export failed to resolve, the component's props collapsed to `{}` and line 48
failed on `currentUser`. One specifier fixes both. I made the edit because you
asked me to check it before finishing, no other worker owns that file, and
leaving it would have failed `tsc` and `next build` for everyone. The three
assertions `automation-studio-live-ownership.test.ts` makes about that file
still hold.

## What changed and why

**The kind rule, exactly as the architecture document's worked example
specifies.** `PascalCase.tsx` → `components/`, `useX` → `hooks/`,
`*-commands.ts` → `commands/`, everything else loose, plus the one naming fix
(`use-gateway-recording-bridge.ts` → `hooks/useGatewayRecordingBridge.ts`) so
the rule can see it.

**No `live/index.ts`, and I did not create one.** I reached the same conclusion
independently before your correction, from
`scripts/structure-audit/rules/imports.mjs`: `barrelDirectories()` only marks a
directory barrel-protected when an `index.ts` exists. Adding one to `live/`
would convert every import from the new kind folders back into the live root
into a fresh ratcheted key at once.

**Cross-directory imports inside `live/` target the directory, not the file** —
`../hooks`, `../commands`, `../components`, `../view-host`.

**Duplicate imports merged.** Pulling 14 hooks out of `AutomationStudioSession.tsx`
would otherwise have left 14 consecutive `import { … } from "../hooks";` lines.
Statements sharing a specifier were merged in the four files where that arose.

**A design signal, as requested.** The split surfaced exactly one place where a
kind boundary was being reached across, and it was not hooks reaching into
component internals — it was the composition root reaching into the view host's
internals. That is a real public surface that had never been declared, which is
why widening `view-host/index.ts` was the right fix rather than a workaround.
Separately, the split did expose one genuine hook→component dependency
(`hooks/useAutomationConnectedRegionSurfaces.tsx` renders
`components/AutomationStudioConnectedRegions`), which now goes through the
`components` barrel; see the cycle note below.

## Commands run and observed results

### Export surface

Every symbol declared and exported by any non-test, non-barrel file under
`live/`, via the TypeScript AST, at `HEAD` versus the working tree:

```text
before: 108   after: 108
$ diff before.txt after.txt
IDENTICAL
```

### Typecheck

```text
$ pnpm exec tsc --noEmit          # in apps/web
exit 0, no output
```

### Scoped tests

```text
$ pnpm exec vitest run src/features/automation-studio/live --reporter=basic

before:  Test Files  17 passed (17)   Tests  97 passed (97)
after:   Test Files  17 passed (17)   Tests  97 passed (97)
```

Identical counts, fully green. (Mid-task this suite showed one failure,
`ENOENT … hierarchy\create-command-executor.ts`, from the concurrent
`core-web-hierarchy` move; that literal has since been repointed to
`../../hierarchy/commands/create-executor.ts` and the suite is clean.)

### Structure audit

`node scripts/structure-audit.mjs --json`, re-run after `git add -N` on the new
barrels — your `git ls-files` point was live here: before staging them the audit
reported `hooks` = 19, after = 20, because it could not see `hooks/index.ts`.

| Rule | `live/` before | `live/` after |
| --- | --- | --- |
| `directory-files` | `live` = **36**, baselined | `live` **not reported at all** (6 files, below the 15 warn line). `hooks` 20 (warn only, under the 25 fail cap); `components` 8 and `commands` 5 not reported. |
| `naming` | no findings | no findings — no prefix group of 3 in any new directory, and `use` is prefix-exempt |
| `imports` | 32 baselined keys | 17 fail entries, all re-keyed; Session lowered 6 → 3; zero crossings inside `live/` |

The baseline entry `apps/web/src/features/automation-studio/live: 36` is now
obsolete and should drop on regeneration. I did **not** run
`pnpm structure:baseline`.

Each re-keyed `imports` entry checked against its pre-move baseline value:

```text
same 2  commands/domain-commands.ts                    (was 2 at domain-commands.ts)
same 2  commands/recording-domain-commands.ts          (was 2 at recording-domain-commands.ts)
same 1  commands/state-domain-commands.ts              (was 1 at state-domain-commands.ts)
same 1  components/AutomationHierarchySurface.tsx      (was 1 at AutomationHierarchySurface.tsx)
same 2  components/AutomationStudioComposition.tsx     (was 2 at AutomationStudioComposition.tsx)
same 1  components/AutomationStudioConnectedRegions.tsx (was 1 at AutomationStudioConnectedRegions.tsx)
LOWER 3 components/AutomationStudioSession.tsx         (was 6 at AutomationStudioSession.tsx)
same 2  components/AutomationStudioWorkspaceComposition.tsx (was 2 at …)
same 1  components/tests/AutomationHierarchySurface.selection.test.tsx (was 1 at tests/…)
same 1  components/tests/AutomationStudioProjectGate.test.tsx (was 1 at tests/…)
same 1  hooks/tests/project-opening-hydration-revision.test.tsx (was 1 at tests/…)
same 1  hooks/useAdaptationWorkspaceNavigation.ts      (was 1 at useAdaptationWorkspaceNavigation.ts)
same 2  hooks/useAutomationGraphRuntime.ts             (was 2 at useAutomationGraphRuntime.ts)
same 2  hooks/useAutomationHierarchyCommandBridge.ts   (was 2 at useAutomationHierarchyCommandBridge.ts)
same 1  hooks/useAutomationSelectionNavigation.ts      (was 1 at useAutomationSelectionNavigation.ts)
same 1  hooks/useAutomationSessionDirtyGuards.ts       (was 1 at useAutomationSessionDirtyGuards.ts)
same 1  hooks/useAutomationWorkspaceRuntime.ts         (was 1 at useAutomationWorkspaceRuntime.ts)
```

### Every path literal inside `live/` resolves

A sweep of all `.ts`/`.tsx` string literals under `live/`, resolved against
their containing file: **zero unresolved**.

## Not verified

- **The shared architecture tests outside `live/` were not re-run** and are
  expected red until you repoint them. Their pre-move baseline, so you have a
  number to return to: `automation-studio/{tests, testing/tests, graph/tests,
  project/tests}` plus `views/tests/canonical-diagnostics-disclosure.test.ts`
  and `workspace/tests/strict-runtime-contract.test.ts` were **37 files / 201
  cases, 2 failed** before I touched anything —
  `graph/tests/derivation-job.test.ts` and
  `testing/tests/synchronous-interaction-trace.test.ts`, both already listed as
  pre-existing defects in `Current State`.
- No browser or runtime validation. This is a pure file move; behaviour is
  covered only by the vitest run above.
- No repository-wide `pnpm check`, `pnpm test` or `pnpm build` — other workers
  were editing concurrently and results would not have been attributable.

## Open questions or contradictions found

1. **`apps/web` does not write explicit import extensions; `packages/fluxiq`
   does.** The dispatch said "this repository writes explicit extensions, so
   name `index.ts` rather than relying on directory resolution." Measured:
   `apps/web/src` has **0** relative imports carrying a `.ts`/`.tsx` extension,
   and `apps/web/tsconfig.json` does not set `allowImportingTsExtensions`, so
   writing one would be a type error. `packages/fluxiq/src` is the opposite —
   1388 extension-bearing relative imports against 2 without. The root
   `tsconfig.base.json` sets `moduleResolution: "Bundler"`, under which bare
   directory imports resolve, and the audit exempts them via
   `directories.has(target)`. I therefore used `../view-host`, consistent with
   the 26 other directory imports in this change and with the rest of
   `apps/web`; `tsc --noEmit` is clean and all 97 tests pass. Worth splitting
   that guidance per package before it reaches another web-side worker.
2. **Not every external reference into `live/` is a path literal.** The revised
   brief's reasoning — "path literals are strings, so types stay clean" — held
   for 33 of 34 references but not for `AutomationStudioLive.tsx:3`, a real
   `export … from` that broke `tsc` and cascaded into `ProgramLiveViews.tsx`.
   Fixed. Worth re-checking `flow-editor/` for the same class before assuming
   its typecheck is clean.
3. **The barrels introduce one module cycle inside `live/`, and I let it
   stand.** `components/AutomationHierarchySurface.tsx` imports `../hooks`,
   while `hooks/useAutomationConnectedRegionSurfaces.tsx` imports
   `../components`. It is inherent to splitting a feature by kind when a hook
   renders a component; breaking it would require a barrel-skipping import — a
   real ratcheted violation traded for a theoretical one. Both bindings are read
   only at render time, and the render-based tests
   (`AutomationHierarchySurface.selection.test.tsx`,
   `project-opening-hydration-revision.test.tsx`) pass. Flagging it in case a
   future Fast Refresh or SSR oddity traces back here.
4. **Workers dispatched from one session share the scratchpad directory.** My
   first export baseline was silently overwritten by another worker using the
   same filename; I only caught it because the resulting diff was full of
   flow-editor symbols. I rebuilt from `git show HEAD:…` and moved to a unique
   prefix. The failure mode is a *plausible wrong answer*, not an error, so the
   unique-filename rule belongs in the dispatch template, not only in the worker
   definition.
5. **`hooks/` at 20 files is one grouping away from the cap**, the same way the
   plan predicts for `model/`. That is the ratchet working, not a problem to
   pre-empt now.
