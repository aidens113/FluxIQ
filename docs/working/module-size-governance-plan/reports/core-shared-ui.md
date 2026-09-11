# Worker report: core-shared-ui

Brief: `### Brief: core-shared-ui`, Phase 4 / 5 / 8 dispatch — 2026-09-10.
Repository: FluxIQ Core (`F:\!FluxIQ`), branch `dev`.

## Outcome

**Done.** `apps/web/src/features/programs/shared-ui.tsx` (1,087 lines, 40
exported values of which 36 were components) is now 7 lines that re-export
`./components`. The 36 components live one per file across five kind
subdirectories. The module's resolved export surface is byte-identical: 50
names, diffed and confirmed. All four `vitest.quality.config.ts` paths
resolve. `pnpm exec vitest run src/features/programs/` is 22 files / 84 tests
passing, identical to the pre-change counts.

Also applied, at the coordinator's mid-task request, the two CSS-path fixes in
files I own that the concurrent `core-styles` worker could not apply itself.

## What changed and why

### The split

`components/` holds only `index.ts`; the 36 components and 4 helper values sit
in five subdirectories. A flat `components/` would have held 41 source files
and tripped `directory-files` (limit 25) — a *new* baseline entry, which the
ratchet forbids. Grouping by kind keeps every directory under the 15-file
advisory threshold as well:

| Directory | Source files (incl. barrel) | Contents |
| --- | --- | --- |
| `components/` | 1 | barrel only |
| `components/controls/` | 8 | ActionLink, Button, Combobox, Field, IconButton, Menu, Segmented |
| `components/layout/` | 6 | Breadcrumb, Panel, Splitter, Toolbar, Tooltip |
| `components/data/` | 13 | CodeViewer, DataTable, JsonViewer, KeyValue, List, ListRow, Pagination, SpecDatum, StatusBadge, SummaryStrip, Tree, resolveTreeFocusId |
| `components/feedback/` | 11 | EmptyState, GlobalAlertViewport, InlineNotice, LoadingState, Progress, Skeleton, StatusText, VisualAlert, notifyGlobalAlert, tone |
| `components/overlays/` | 6 | AlertDialog, AuthorizationDialog, Drawer, Modal, ModalContent |

Every non-barrel file exports exactly one component; the maximum exported
values in any one file is 2 and the longest file is 139 lines (was 1,087).

Deliberate detail decisions:

- **Types travel with their component** — `ButtonVariant`/`ButtonSize` with
  `Button`, `MenuOption` with `Menu`, `TreeNode` with `Tree`, `DialogProps`
  with `ModalContent` (both `Modal` and `Drawer` delegate to it),
  `AuthorizationCredentials`/`AuthorizationRequirements` with
  `AuthorizationDialog`. Types are not counted as exported values by the rule
  and this is how `shared-ui.tsx` already grouped them.
- **`feedback/tone.ts` holds `AlertTone`, `toneFromMessage` and
  `titleFromTone` together.** Strictly one-export-per-file would split a
  four-line and a five-line function that are the same vocabulary and never
  travel apart. Two exported values is far under both the 15-value limit and
  the 8-value advisory. The brief's bar — one exported *component* per file —
  is met everywhere.
- **Private helpers stayed inside their single consumer**, exactly as before:
  `flattenTree` in `Tree.tsx`, `boundedJsonPreview` in `JsonViewer.tsx`,
  `downloadText` in `CodeViewer.tsx`, `GlobalAlertCard` in
  `GlobalAlertViewport.tsx`. Giving them their own files would have leaked
  them into the barrel through `export *` and widened the public surface.
- **`feedback/index.ts` re-exports `notifyGlobalAlert` by name, not `export *`.**
  `notifyGlobalAlert.ts` must export the `GlobalAlertPayload` type so
  `GlobalAlertViewport.tsx` can type the event detail it receives; a blanket
  `export *` would have published an 11th type that `shared-ui.tsx` never
  exported. The named re-export keeps the surface at exactly 50.
- **Cross-group imports go to the group barrel, never into its files** —
  `data/CodeViewer.tsx` imports `../controls`, `../layout`, `../feedback`;
  `overlays/AlertDialog.tsx` imports `../controls`. The `imports` rule exempts
  a specifier that resolves to a directory. Group dependencies are acyclic:
  `controls`, `layout` and `feedback` are leaves; `data` and `overlays`
  consume them.
- **`"use client"` on every new file**, including the barrels, because
  `app/layout.tsx` is a server component that imports `GlobalAlertViewport`
  through this chain.

### The decision the brief asked for: shim, not repoint

**I kept `shared-ui.tsx` as a thin re-export.** Both options leave the same
number of barrel-skipping imports — zero — so the deciding factor was
ownership, not the metric.

Measured, not assumed. The `imports` rule only counts a specifier as
barrel-skipping when the *target's* directory contains an index file
(`barrels.has(targetDir)`), and it exempts any specifier resolving to a
directory:

- Keeping the shim: the ~48 existing `.../programs/shared-ui` importers resolve
  to `apps/web/src/features/programs/shared-ui`, whose directory
  (`.../features/programs`) has no `index.ts`. Not counted. **0.**
- Repointing every importer to `.../programs/components`: that specifier
  resolves to a tracked directory, which the rule skips outright. Also **0.**

With the metric tied, the decisive fact is that **40 of the 48 importers live
under `apps/web/src/features/automation-studio/` and 5 under
`apps/web/src/app/`** — neither is mine, and `automation-studio/**` is an
explicit "must not touch" with three workers editing it concurrently. Only 11
importers are inside `features/programs/`. Repointing was not available to me,
and repointing 11 of 48 would have left the shim in place anyway while adding
diff noise. The shim is a single 7-line file with a comment pointing new code
at `./components`.

Cost of that choice, stated plainly: the `naming` banned-basename finding on
`shared-ui.tsx` survives (`bannedBasenames` in
`scripts/structure-audit/config.mjs` lists `"shared-ui"`). It is frozen in the
baseline at 1 and does not rise. It can only be retired by a follow-up that
repoints all 48 importers and deletes the file — work that spans
`automation-studio/`, `app/` and `programs/` and therefore belongs to one
owner after the concurrent phases land.

### The test

`tests/shared-ui.test.tsx` → `tests/component-contracts.test.tsx` (`git mv`,
history preserved). Renamed for two reasons: its subject is now `components/`,
not a 7-line shim, and the old stem was itself a baselined banned-basename
finding, which the rename retires.

Three of its assertions read `../shared-ui.tsx` as raw source and would have
been asserting against the shim. They now read a recursive concatenation of
every file under `../components/`, which preserves the original semantics
exactly — the positive assertions still find their strings, and the negative
ones ("nothing here mutates `document.body.style.overflow`", "nothing here
attaches a document-level `wheel` listener") still range over the whole shared
UI rather than one fragment of it. Its import stays on `../shared-ui`, so the
test also guards that the shim re-exports the full surface.

`apps/web/vitest.quality.config.ts` updated to the new filename.

### The two coordinator-assigned CSS fixes

The `core-styles` worker split `app/styles/global-foundation.css` and
`global-programs.css` into numbered section directories; two tests in my
directory read them by raw path and failed ENOENT.

1. `tests/component-contracts.test.tsx` — the `global-foundation.css` read
   became `readCssManifest(new URL("../../../app/globals.css", …))`, importing
   from `../css-manifest-test-helper` as five sibling tests already do. The
   resolved manifest keeps the assertion against the whole cascade instead of
   narrowing it to one section. All three assertions hold.
2. `tests/phase7-responsive-contract.test.ts` — the single
   `global-programs.css` entry became the six real section paths, read from
   the directory rather than assumed: `01-identity-and-access.css`,
   `02-secret-keys.css`, `03-docs-workspace.css`, `04-background-tasks.css`,
   `05-compute-control.css`, `06-production-and-route-states.css`. Both
   negative assertions hold across all six.

### Files

Created (45, staged with `git add` so `scripts/structure-audit.mjs`, which
enumerates via `git ls-files`, can see them; **not committed**):
`apps/web/src/features/programs/components/**`.

Modified: `apps/web/src/features/programs/shared-ui.tsx` (1,090 → 7 lines),
`apps/web/src/features/programs/tests/phase7-responsive-contract.test.ts`,
`apps/web/vitest.quality.config.ts`.

Renamed + modified:
`apps/web/src/features/programs/tests/shared-ui.test.tsx` →
`tests/component-contracts.test.tsx`.

Not touched: `apps/web/src/features/automation-studio/**`, `apps/web/src/app/**`,
`.structure-baseline.json`, `biome.json`. `pnpm structure:baseline` not run.

## Commands run and observed results

### Export surface — identical

Enumerated with the TypeScript checker's `getExportsOfModule` on
`shared-ui.tsx` before and after (the "before" list from a direct AST walk of
the original file; the "after" list resolved through
`shared-ui.tsx → components/index.ts → 5 group barrels → 40 files`):

```
$ diff surface-before.txt surface-after.txt
$ echo $?
0
```

**50 names, byte-for-byte identical**: 10 types (`AlertTone`,
`AuthorizationCredentials`, `AuthorizationRequirements`, `BreadcrumbItem`,
`ButtonSize`, `ButtonVariant`, `ComboboxOption`, `DialogProps`, `MenuOption`,
`TreeNode`) and 40 values (36 components plus `notifyGlobalAlert`,
`resolveTreeFocusId`, `titleFromTone`, `toneFromMessage`).
`GlobalAlertPayload` correctly did **not** leak.

### Per-file export counts

```
non-barrel totals: values=40 components=36 types=11
MAX per non-barrel file -> values=2 (limit 15), components=1 (limit 1), lines=139 (warn 400, fail 800)
```

40 values and 36 components across the tree match the original exactly. The
11th type is the barrel-excluded `GlobalAlertPayload`.

### Structure audit

`node scripts/structure-audit.mjs --json` plus a direct run of the
`file-lines`, `directory-files`, `exported-values`, `naming`, `imports` and
`test-placement` rule modules, filtered to
`apps/web/src/features/programs` and excluding `automation-studio`, with the
new files staged so `git ls-files` sees all 45:

```
--- findings under apps/web/src/features/programs (after) ---
fail | exported-values | apps/web/src/features/programs/live-views/shared.tsx::values | 24/15
fail | naming | apps/web/src/features/programs/shared-ui.tsx | 1/0
fail | naming | apps/web/src/features/programs::program | 4/3
warn | exported-values | apps/web/src/features/programs/ui-performance-budgets.ts::values | 10/8
warn | exported-values | apps/web/src/features/programs/ui-performance.ts::values | 14/8
--- tracked source files now seen under components/ ---
45
```

**Zero findings of any rule against the 45 new files** — no `directory-files`,
no barrel-skipping `imports`, no `file-lines`, no `exported-values`, no
`naming`, no `test-placement`.

Against the seven baseline keys under `features/programs`:

| Baseline key | Before | After |
| --- | --- | --- |
| `exported-values … shared-ui.tsx::values` | 40 | **gone** |
| `exported-values … shared-ui.tsx::components` | 36 | **gone** |
| `file-lines … shared-ui.tsx` | 1087 | **gone** (7 lines) |
| `naming … tests/shared-ui.test.tsx` | 1 | **gone** (renamed) |
| `naming … shared-ui.tsx` | 1 | 1 (shim keeps the name) |
| `naming … programs::program` | 4 | 4 (pre-existing, not mine) |
| `exported-values … live-views/shared.tsx::values` | 24 | 24 (not mine) |

Four retired, none raised, none added. The supervisor's
`pnpm structure:baseline` should drop those four keys.

Repository-wide the audit went from 1 failure to 52, and I checked each one:
**none is under `features/programs`.** They are the `core-web-flow-editor`,
`core-web-live`, `core-storage-split` and `core-api-contracts` workers'
in-flight trees, plus the pre-existing `working-docs | docs/working/README.md`
staleness that was already failing before I started.

### Tests — `pnpm exec vitest run src/features/programs/` (from `apps/web`)

Before:
```
 Test Files  22 passed (22)
      Tests  84 passed (84)
```

After:
```
 Test Files  22 passed (22)
      Tests  84 passed (84)
```

File and case counts unchanged, all green.
`component-contracts.test.tsx` runs 20 tests, the same 20 that
`shared-ui.test.tsx` ran.

Two intermediate runs were red and neither was mine; both are recorded here
because they cost real time and the next worker may hit them:

- 2 failures, `ENOENT … app/styles/global-foundation.css` and
  `… global-programs.css`. Cause: `core-styles` had already staged the split of
  both stylesheets (`git status` showed `D global-foundation.css` +
  `A global-foundation/01-…`). This is what the coordinator then assigned me to
  fix; after the two fixes both tests pass.
- 8 collection failures, all
  `Failed to load url ../flow-editor/FlowEditorView … in
  automation-studio/views/canonical-view-definitions.tsx`. Cause:
  `core-web-flow-editor` had staged
  `flow-editor/FlowEditorView.tsx → flow-editor/components/FlowEditorView.tsx`
  without yet repointing that importer. It cleared on its own once that worker
  finished. This is exactly the "sudden burst of `Failed to load url` errors"
  the dispatch predicted.

### Quality config — four paths resolve, 36 tests pass

```
$ pnpm --filter @fluxiq/web exec vitest run --config vitest.quality.config.ts --coverage
 ✓ src/lib/tests/program-route.test.ts (7 tests)
 ✓ src/features/automation-studio/model/tests/project-artifacts.test.ts (2 tests)
 ✓ src/lib/tests/login-attempts.test.ts (7 tests)
 ✓ src/features/programs/tests/component-contracts.test.tsx (20 tests)
 Test Files  4 passed (4)
      Tests  36 passed (36)
```

All four `include` paths and both coverage `include` paths resolve.

The run then exits 1 on coverage thresholds:
`lines 89.13% < 90`, `statements 89.13% < 90`, `branches 80.48% < 85`, all from
`src/lib/login-attempts.ts` (88.16%); `program-route.ts` is at 100%.
**This is pre-existing and independent of my change**, proved rather than
assumed: `src/lib/` is clean in `git status` (untouched by every worker), and
running only the two lib tests reproduces the identical figures —

```
$ pnpm exec vitest run src/lib/tests/login-attempts.test.ts src/lib/tests/program-route.test.ts --coverage …
All files          |   89.13 |    80.48 |   95.83 |   89.13
 login-attempts.ts |   88.16 |    76.47 |   95.23 |   88.16
 program-route.ts  |     100 |      100 |     100 |     100
```

— so the programs test contributes nothing to these numbers and never did.

### Type check — `pnpm exec tsc --noEmit` (from `apps/web`)

Final state, 2 errors, **0 caused by this work**:

```
src/features/automation-studio/AutomationStudioLive.tsx(3,69): error TS2307:
  Cannot find module './live/AutomationStudioComposition' …
src/features/programs/ProgramLiveViews.tsx(48,60): error TS2769: No overload matches this call.
  Type '{ currentUser: CurrentUser; }' is not assignable to type 'IntrinsicAttributes'.
```

The second is a knock-on of the first: `AutomationStudioLive.tsx` cannot
resolve its composition module, so the props type of the component it exports
collapses to `{}`, and `ProgramLiveViews.tsx` line 48 —
`<AutomationStudioLive currentUser={user} />`, reached through `next/dynamic`
from `../automation-studio/AutomationStudioLive` — stops type-checking.
`ProgramLiveViews.tsx` is unmodified by me (`git status` lists only
`shared-ui.tsx`, the renamed test, `phase7-responsive-contract.test.ts`, and
the new `components/`), and nothing in the error touches `shared-ui` or
`components`. It will clear when `core-web-live` finishes, the same way the
flow-editor failures did.

An earlier run of the same command, taken while the other workers were in a
different intermediate state, showed **0 errors in `src/features/programs`,
`src/app` and `src/lib`** with all 192 errors then in `automation-studio` and
`packages/fluxiq`.

## Not verified

- **No browser or `next build` validation.** The split changes how Next.js
  sees the client-component boundary (`"use client"` is now on 45 modules
  instead of 1). I reasoned it through and put the directive on every new file
  including the barrels, but `pnpm build` is not runnable while
  `automation-studio` and `packages/fluxiq` are mid-refactor by other workers.
  **This is the one thing that should be re-checked once the tree is whole** —
  `app/layout.tsx` is a server component that reaches `GlobalAlertViewport`
  through `shared-ui.tsx → components/index.ts → feedback/index.ts`.
- **Full-repository `pnpm check` / `pnpm test` not run** — they are red from
  four other workers' in-flight trees and would tell me nothing about my own.
  Scoped equivalents are reported above.
- **Runtime behaviour of individual components was not re-derived**; component
  bodies were moved verbatim (extracted by line range from the original) and
  only import headers were authored. The 20 render-level assertions in
  `component-contracts.test.tsx` pass unchanged, which covers 25 of the 36.
- **`biome.json` not touched** (not mine, and see below).

## Open questions or contradictions found

1. **`biome.json` has a stale path, independent of my change.** Its
   `files.includes` allowlist names
   `apps/web/src/features/programs/shared-ui.test.tsx` — a path that has not
   existed since Phase 1 moved that test into `tests/`. It also names
   `.../programs/shared-ui.tsx` and carries an override disabling
   `a11y/noLabelWithoutControl` and `suspicious/noArrayIndexKey` for it. After
   this split those suppressions apply to a 7-line re-export, and the
   components they were written for (`Field`, `DataTable`, `KeyValue`,
   `SummaryStrip`, `Breadcrumb`, `Skeleton`) are no longer in the allowlist, so
   **biome now lints none of them**. That is not a new failure — the allowlist
   is opt-in — but it is a silent loss of coverage. Someone who owns
   `biome.json` should decide whether to add
   `apps/web/src/features/programs/components/**` with the same two
   suppressions, and fix the dead `shared-ui.test.tsx` entry while there. I did
   not touch it because it is outside my brief and is a single shared file that
   several concurrent workers could collide on.

2. **The `shared-ui` banned-basename finding needs a dedicated follow-up.**
   Retiring it means repointing 48 importers across
   `features/automation-studio/` (40), `app/` (5) and `features/programs/` (3,
   plus the test) from `.../programs/shared-ui` to `.../programs/components`,
   then deleting the shim. All 48 are plain named-import lines and two are
   `vi.mock` specifiers in
   `automation-studio/authoring/tests/blank-flow-authoring.test.tsx` and
   `automation-studio/runtime/tests/diagnosis-authorization-interactions.test.tsx`,
   which mock `"../../../programs/shared-ui"` with `importOriginal` — those two
   must move with the rest or they will silently mock a module nothing imports
   any more. It is a single mechanical pass for one owner once Phases 4 and 8
   land; it cannot be partitioned by file the way this dispatch was, because
   the shim can only be deleted when the last importer is gone.

3. **Phase 5's plan text says "37 components"; the file has 36.** The 37th
   exported PascalCase name the plan likely counted is not a component —
   `shared-ui.tsx` exported 40 values, of which 36 are components and 4
   (`notifyGlobalAlert`, `resolveTreeFocusId`, `toneFromMessage`,
   `titleFromTone`) are plain functions. The baseline agrees with me:
   `shared-ui.tsx::components = 36`, `::values = 40`. No action needed; the
   plan's prose is just one off.

4. **Staging was required for the audit to be truthful, and that is a trap
   worth recording.** `scripts/structure-audit/context.mjs` enumerates via
   `git ls-files`, so **untracked files are invisible to every rule**. My first
   post-change audit run reported a clean `components/` tree that it had not
   actually looked at. Any worker that creates files rather than `git mv`-ing
   them must `git add` before trusting `pnpm structure:check`. Worth a line in
   the dispatch shared context for future phases.
