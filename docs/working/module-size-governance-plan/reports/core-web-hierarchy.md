# Worker report: core-web-hierarchy

Phase 4 kind split of `apps/web/src/features/automation-studio/hierarchy/`.

## Outcome

**Partial.** 11 of the 17 kind-eligible files moved into `components/`,
`hooks/`, and `commands/`. The directory falls from **41 to 30** direct source
files. The brief's gate of "at or under 25" was **not reached**, and could not
be reached from inside `hierarchy/**`: the remaining 6 files are pinned by real
TypeScript `import` statements in `live/` and `project/`, neither of which I
own. Details and exact remediation below.

## The brief's premise was wrong: there is no `hierarchy/index.ts`

The brief says "`hierarchy/index.ts` keeps its exports." That file does not
exist and never has. `hierarchy/` has no barrel, so every consumer reaches its
files by deep relative path. The same is true of `live/` — of the three Phase 4
directories only `flow-editor/index.ts` exists, so the `core-web-live` brief
carries the same false premise.

**Creating the barrel would fail the build, so I did not.** The `imports` rule
counts a barrel-skipping import only when the target directory has a barrel
(`if (!barrels.has(targetDir)) continue;` in
`scripts/structure-audit/rules/imports.mjs`). Adding `hierarchy/index.ts` would
retroactively convert every existing deep import into a violation. I simulated
it against the live tracked-file list and the current baseline:

```
importer files affected: 28
new-key failures: 14
baseline-exceeded failures: 3
```

`baseline.mjs` fails a ratcheted finding outright when its key has no record
("fails outright when there is no record"), so that is 17 hard failures of
`pnpm check`. Phase 4 for `hierarchy/` therefore cannot use the Phase 2/3
barrel pattern: the kind directories get barrels, the feature root does not.

## What moved: complete old -> new mapping

Repository-relative paths, one line per moved file, all under
`apps/web/src/features/automation-studio/hierarchy/`. Every move used `git mv`;
git recorded all 12 as renames.

| Old | New |
| --- | --- |
| `ProjectTree.tsx` | `components/ProjectTree.tsx` |
| `tree-rows.tsx` | `components/TreeRows.tsx` |
| `tests/ProjectTree.test.tsx` | `components/tests/ProjectTree.test.tsx` |
| `useAutomationHierarchyWorkspaceState.ts` | `hooks/useAutomationHierarchyWorkspaceState.ts` |
| `usePostPaintHierarchyReconciliation.ts` | `hooks/usePostPaintHierarchyReconciliation.ts` |
| `usePrimaryTreeNodeId.ts` | `hooks/usePrimaryTreeNodeId.ts` |
| `useSelectionDisclosure.ts` | `hooks/useSelectionDisclosure.ts` |
| `commands.ts` | `commands/definitions.ts` |
| `command-executor-contracts.ts` | `commands/command-contracts.ts` |
| `command-executor-support.ts` | `commands/support.ts` |
| `create-command-executor.ts` | `commands/create-executor.ts` |
| `delete-command-executor.ts` | `commands/delete-executor.ts` |

Three barrels added — `components/index.ts`, `hooks/index.ts`,
`commands/index.ts` — each `export * from` its own files, matching the
convention in `flow-editor/commands/index.ts` and `state/commands/index.ts`.

### Stale external references: yours to repoint

Exactly 6, all filesystem path literals, none of them imports. Verified by scan
after the move:

```
live/tests/automation-studio-live-ownership.test.ts:282   "../../hierarchy/create-command-executor.ts"
stores/tests/domain-state-ownership.test.ts:5             "../../hierarchy/useAutomationHierarchyWorkspaceState.ts"
testing/tests/render-boundary-source-contract.test.ts:8   "../../hierarchy/ProjectTree.tsx"
tests/architecture-contract.test.ts:118                   "hierarchy/ProjectTree.tsx"
tests/architecture-contract.test.ts:120                   "hierarchy/tree-rows.tsx"
workspace/tests/strict-runtime-contract.test.ts:57        "../../hierarchy/create-command-executor.ts"
```

Apply the mapping table above. Note that `tree-rows.tsx` ->
`components/TreeRows.tsx` changes case as well as directory.

Path literals *inside* `hierarchy/` were mine and are fixed:
`tests/architecture.test.ts` (`ProjectTree.tsx`, `tree-rows.tsx` and
`commands.ts` in its `implementationFiles` list) and the relocated
`components/tests/ProjectTree.test.tsx` (its `05-hierarchy.css`, `TreeRows.tsx`
and `usePrimaryTreeNodeId.ts` literals).

## What did not move, and why

Six kind-eligible files are reached by real `import` statements from outside
`hierarchy/`. No barrel absorbs those, so moving them breaks `tsc`. The
directories holding the importers are in my "must not touch" list, and `live/`
is held by a concurrent worker.

| File | Blocking importer(s) |
| --- | --- |
| `AutomationHierarchyDialog.tsx` | `live/AutomationStudioConnectedRegions.tsx` |
| `AutomationProjectHierarchySidebar.tsx` | `live/AutomationHierarchySurface.tsx` |
| `ProjectBrowser.tsx` | `project/ProjectCatalogSurface.tsx` |
| `ProjectModal.tsx` | `project/ProjectCatalogSurface.tsx` |
| `useHierarchyPersistence.ts` | `live/useAutomationHierarchyUiRuntime.ts` |
| `command-executor.ts` | `live/AutomationStudioSession.tsx`, `live/useAutomationHierarchyCommandBridge.ts` |

Moving these 6 lands the directory on **24**, the plan's Phase 4 target. They
are a clean follow-up once `live/` and `project/` are free: move the file, then
repoint the importer at `./components`, `./hooks` or `./commands`. Names are
already reserved so nothing collides — `command-executor.ts` becomes
`commands/executor.ts`, which adds no `naming` prefix group because its
siblings are `command-contracts`, `support`, `create-executor`,
`delete-executor` and `definitions`.

I deliberately did **not** leave re-export shims at the old paths. Shims are
themselves direct source files, so they would have held the count at 30 while
adding a second importable path for every moved symbol.

## Commands run and observed results

**Structure audit** — `node scripts/structure-audit.mjs --json`, before and
after:

```
BEFORE failures touching hierarchy: 0
AFTER  failures touching hierarchy: 0
BEFORE warnings touching hierarchy: 3
AFTER  warnings touching hierarchy: 3   (same three, at their new paths)
AFTER lowerable: directory-files apps/.../hierarchy: baseline 41 -> now 30
```

The three warnings are unchanged in value, only relocated:
`command-executor-support.ts::values 9` -> `commands/support.ts::values 9`;
`tests/ProjectTree.test.tsx 523 lines` ->
`components/tests/ProjectTree.test.tsx 523`; `tests/hierarchy-state.test.ts 573`
(did not move).

Two baseline entries can be lowered by the supervisor's
`pnpm structure:baseline` (I did not run it, per the brief): `directory-files`
`.../hierarchy` 41 -> 30, and the `naming` prefix group `.../hierarchy::command`
(3), now resolved — only `command-executor.ts` still carries the `command-`
prefix, and `commands/` introduces no new group. The 7 `imports` baseline keys
for `hierarchy/` files are untouched; none of those files moved.

Total repository failures rose 1 -> 75 during my run, and **none are mine**: 17
in `flow-editor/`, 18 in `live/`, 39 in `packages/`, 1 pre-existing
`docs/working/README.md` entry. Zero of the 75 mention `hierarchy`.

**Type check** — `pnpm exec tsc --noEmit` in `apps/web`: 259 errors, **0 in
`hierarchy/`**, and none naming any module I moved (grepped explicitly for all
11 old names: no match). Errors group as `live/` 254, `views/` 2, `programs/` 1,
`graph/` 1 — the concurrent workers' in-flight moves. Several are `live/` files
under new `live/hooks/` and `live/components/` paths still importing
`../hierarchy/<file>` at the old depth, for files I did not move (`contracts`,
`paged-cache`, `ui-coordinator`, `store`, `model`, ...); that is the `live/`
worker's re-depthing, not my change.

**Tests** — `pnpm exec vitest run src/features/automation-studio/hierarchy`:

```
BEFORE   Test Files  1 failed | 14 passed (15)      Tests  1 failed | 97 passed (98)
AFTER    Test Files  1 failed | 14 passed (15)      Tests  1 failed | 97 passed (98)
```

File and case counts identical. The single failure is the pre-existing one the
brief names: `tests/phase7-contracts.test.ts` > "activates Router before
reconciling the Flow selection", at line 96:22, expecting `"flow-router"` but
receiving `"flow-router::object::flow.checkout"` — identical before and after.
**Confirmed unchanged, not fixed.**

An intermediate run showed 2 failures: I had missed `"commands.ts"` in the
`implementationFiles` list of `tests/architecture.test.ts`, which ENOENT'd.
Fixed to `"commands/definitions.ts"`; the rerun above is the corrected result.

**Export surface** — the brief asks for a barrel diff; with no barrel to diff,
the equivalent proof is the exported-symbol inventory of the whole directory,
parsed with the TypeScript AST:

```
before(non-barrel): 184   after(non-barrel): 184
diff -> IDENTICAL - no symbol added, removed, or renamed
```

The only additions are the 11 `export *` lines in the three new barrels. No
exported symbol was renamed, consistent with "rename the path, not the symbol".

## Notes on naming choices

`command-executor-contracts.ts` became `commands/command-contracts.ts`, not
`commands/contracts.ts`, for two reasons: it matches
`flow-editor/commands/command-contracts.ts` and
`state/commands/command-contracts.ts`, and `hierarchy/contracts.ts` already
exists one level up, so the short name would have been ambiguous to readers and
to relative-path edits.

The `commands/` barrel exposes more than the old `commands.ts` did, because
`command-executor.ts` (still loose) needs `contracts`, `support`, `create` and
`delete` from it, and importing those deeply would be a counted barrel-skipping
violation. This is the new directory's public surface, not a widened
pre-existing barrel.

## Not verified

- No browser or runtime validation; this is a pure path refactor.
- `pnpm check`, `pnpm test` and `pnpm build` not run — the tree is concurrently
  red from other workers, so a whole-repository result would not be
  attributable. Everything reported is scoped to `hierarchy/`.
- The 6 stale external path literals are **left broken by design**, per the
  coordinator's instruction to repoint them at integration. Any architecture
  test that reads them stays red until then.
- I did not run `pnpm structure:baseline`, per the brief.

## Open questions

1. `core-web-live`'s brief states `live/index.ts` keeps its exports; that file
   does not exist either. That worker faces the same pinning problem, and the
   two directories import each other — 5 of my 6 blocked files are pinned by
   `live/`. Sequencing the leftover moves after `live/` settles would let one
   pass finish both.
2. Reaching the plan's "24 loose" for `hierarchy/` requires editing 6 import
   sites in `live/` and `project/`. If that belongs in this phase rather than a
   follow-up, it needs an owner holding `hierarchy/`, `live/` and `project/`
   together.
