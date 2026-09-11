# core-web-flow-editor — Phase 4

## Outcome

**Partial.** The split is done and correct: `flow-editor/` went from 36 direct
source files to 13, the barrel's 51 exported names are byte-identical, the
scoped suite is unchanged at 10 files / 43 tests, and there are zero type
errors and zero new audit findings in anything I own.

One thing blocks `pnpm check`, and it is not fixable inside my ownership:
**the move manufactures 36 barrel-skipping imports across 16 new `imports`
keys.** This is the Phase 1 trap recurring, by the identical mechanism the
`Current State` already documents, and it needs the same one-line rule
generalization. `live/` and `hierarchy/` are hitting it right now too.

I left the move in place rather than reverting it, because the move is right
and the rule is what is wrong. See "The blocking finding".

## What changed and why

### The split

| | Before | After |
| --- | --- | --- |
| `flow-editor/` direct source | 36 | **13** |
| `components/` | — | 15 (13 components + `renderer-registry.ts` + `index.ts`) |
| `hooks/` | — | 10 (9 hooks + `index.ts`) |
| `commands/`, `model/` | unchanged | unchanged |

The 13 that stayed loose: `flow-canvas-interaction-controller`,
`flow-editor-types`, `functionality-contract`, `graph-interactions`,
`graph-signatures`, `graph-validation`, `index`, `node-palette`, `node-types`,
`palette-icons`, `palette-model`, `palette-preferences-repository`,
`selection-model`.

Every move used `git mv`, so history follows. No exported symbol was renamed.
No barrel was widened.

### Placement decisions

**`graph-` group — kept loose, no `flow-editor/graph/`.** A sibling feature
directory `automation-studio/graph/` already exists one level up, so
`flow-editor/graph/` would put two unrelated `graph` directories in one feature
tree — and the existing external importer `graph/derivation-job.ts` would read
`../flow-editor/graph/validation`, naming two different `graph`s in one
specifier. The three also share a noun rather than a responsibility:
`graph-interactions` is change-durability predicates, `graph-signatures` is
memo-key hashing, `graph-validation` is problem detection. Their consumer sets
differ accordingly — `graph-validation` is read by five modules,
`graph-signatures` by one.

**`palette-` group — kept loose, no `flow-editor/palette/`.** The closer call:
the three are genuinely cohesive (icon lookup, compatibility model, favorites
persistence). Against it — after the kind split their consumers are
`FlowNodePalette.tsx`, `FlowNode.tsx` and `index.ts`, so the first two now live
in `components/` and `palette/` would be a three-file directory consumed only
from `components/` and the barrel: a barrel and a hop with no boundary crossing
it. Decisive: the cap does not need it. At 13 against a limit of 25 the split
buys nothing, and `palette-preferences-repository.ts` is externally referenced,
so it would have enlarged the repointing set for no gain.

Both groups remain frozen warning-tier baseline entries (`::graph` 3,
`::palette` 3), unchanged.

**One judgement call beyond the brief: `renderer-registry.ts` moved into
`components/`.** It is kebab-case and not a component, so the kind rule left it
loose — but it exists only to map node and edge type keys to `FlowEdge` and
`FlowNode`, it is not exported from `flow-editor/index.ts`, and its only
consumer is `FlowGraphCanvas.tsx`. Leaving it loose forced a choice between two
bad options: import the components barrel from it (a real module cycle —
`components/index` → `FlowGraphCanvas` → `../renderer-registry` →
`./components`, with `automationNodeTypes` read at module-eval time) or import
`./components/FlowEdge` directly and manufacture two more barrel-skipping
imports. Moving it into `components/` makes both of its imports same-directory
and `FlowGraphCanvas`'s import of it same-directory too: zero cycle, zero
skips. That is why the loose count is 13 rather than the plan's 14. Path depth
is 8 segments, exactly at the `maxPathSegments` limit, so it does not trip the
non-ratcheting depth check — worth knowing, because **one more nesting level
anywhere under `features/` would**.

### Barrels

`components/index.ts` and `hooks/index.ts` were added per "every directory has
an `index.ts` barrel". Cross-kind imports target the directory (`"../hooks"`),
not a file inside it, so they are exempt from the barrel rule and correct by
convention. `flow-editor/index.ts` now re-exports its three component names
through `"./components"` rather than through three separate file specifiers —
same names, one fewer barrel-skip.

### Tests

Only one test had a single moved subject, so only one moved:
`tests/FlowReconnectPerformanceGuard.test.ts` →
`components/tests/FlowReconnectPerformanceGuard.test.ts`.

The other six in `flow-editor/tests/` each cover several subjects and correctly
stay at the nearest directory containing all of them:

- `communication-boundary.test.ts` — spans `live/`, `workspace/`, plus a
  component and a loose type module
- `node-visual-model.test.ts` — spans `graph/`, a loose module, a component, a
  hook and a stylesheet
- `palette-preferences-repository.test.tsx` — a component plus a loose module
- `canonical-view-functionality.test.ts` — eleven sibling view contracts
- `flow-canvas-interaction-controller.test.ts`, `large-project-behavior.test.ts`
  — subjects that did not move

`large-project-behavior.test.ts` additionally must not move: it is named by
path from `testing/tests/data-intensive-view-coverage.test.ts`, which is not in
my grant.

### External repointing — 72 references in 8 files

Exactly the 72 I predicted, all mechanical, nothing else in those files
touched:

| Refs | File |
| --- | --- |
| 54 | `views/tests/GraphEditorViews.test.ts` |
| 7 | `tests/architecture-contract.test.ts` |
| 6 | `graph/tests/useAutomationGraphController.test.ts` |
| 1 each | `views/canonical-view-definitions.tsx`, `views/view-surface-preloader.ts`, `views/tests/canonical-diagnostics-disclosure.test.ts`, `graph/tests/recovery-actions.test.tsx`, `stores/tests/domain-state-ownership.test.ts` |

The two ordinary imports (`canonical-view-definitions.tsx` → `FlowEditorView`,
`recovery-actions.test.tsx` → `FlowGraphStatus`) were repointed at the
**specific file**, not at `components/`. Routing them through the components
barrel would have been one fewer barrel-skip each, but it would eagerly pull
`FlowGraphCanvas` into the view definition module and defeat the
`lazy(() => import("./FlowGraphCanvas"))` code-split that
`GraphEditorViews.test.ts` asserts on. Correct behaviour beat a cleaner audit
number.

### Two references my first pass missed, and how I caught them

An import-only scan is not sufficient here. Two breakages surfaced only at
runtime:

1. `flow-editor/tests/communication-boundary.test.ts` holds four hook paths in
   an **array literal** fed to `readFileSync` further down, which my
   `readFileSync(new URL("` pattern did not match.
2. The same file reads `../../live/useAutomationGraphRuntime.ts`, which the
   **`live/` worker moved** to `live/hooks/` while I was working.

After fixing those I replaced guesswork with a sweep over every tracked file
for any string literal naming a moved file at its old location, regardless of
syntax. It now reports clean; the only residual hits are four stale keys in
`.structure-baseline.json` (supervisor-owned, resolved by regeneration) and one
line of prose in another worker's report.

**Cross-worker note the supervisor must reconcile:** #2 is a genuine three-way
coupling. `communication-boundary.test.ts` is mine but points into `live/`; the
`live/` worker cannot edit it and I cannot see their final shape. I repointed
it to `../../live/hooks/useAutomationGraphRuntime.ts`, which resolves against
their current staged tree. **If `live/` moves that file again before
integration, this line breaks again.** The same hazard applies to
`tests/architecture-contract.test.ts` — see "Not verified".

## The blocking finding

**Moving 22 files one level down manufactured 36 barrel-skipping imports
across 16 new `imports` keys.** `pnpm check` will fail until this is resolved.

```
imports findings for flow-editor:  before 0 failures -> after 16 failures
  components/FlowEditorView.tsx = 1          hooks/useAutomationFlowProjectState.ts = 2
  components/FlowGraphCanvas.tsx = 3         hooks/useFlowEditorCanvasInteractions.ts = 6
  components/FlowGraphStatus.tsx = 1         hooks/useFlowEditorClipboardCommands.ts = 1
  components/FlowGraphToolsMenu.tsx = 1      hooks/useFlowEditorCommands.ts = 4
  components/FlowNode.tsx = 2                hooks/useFlowEditorController.ts = 1
  components/FlowNodePalette.tsx = 4         hooks/useFlowEditorGraphDocument.ts = 4
  components/FlowOutline.tsx = 1             hooks/useFlowEditorPalette.ts = 3
  components/FlowReconnectPerformanceGuard.tsx = 1   hooks/useFlowEditorSelection.ts = 5
```

40 skips at those keys, of which 4 already existed at the old paths
(`useAutomationFlowProjectState` 2, `useFlowEditorCanvasInteractions` 1,
`useFlowEditorSelection` 1). **36 are manufactured.**

**The cause is exactly the one `Current State` already records for Phase 1.**
Moving `flow-editor/FlowNode.tsx` to `flow-editor/components/FlowNode.tsx`
turns `./node-types` into `../node-types`. The rule sees a file reaching past
`flow-editor/`'s barrel into one of its files and counts it — even though the
importer *lives inside* `flow-editor/`. It is not an outside consumer; it is
the same-directory import relocated one level, which is the precise argument
that earned `tests/` its exemption.

There is no way to dodge it from inside the directory. The five exemptions are:
target is a directory; same directory; the `tests/` rule; target basename is
`index`; target directory has no barrel. A kind folder importing its parent's
modules matches none of them, and the two available workarounds are the same
two the plan already rejected — widen `flow-editor/index.ts` so its own
subdirectories can reach their siblings (and create `index` → `components` →
`index` cycles), or absorb 16 new baseline keys and defeat the ratchet.

**Recommended fix — generalize the existing exemption.** In
`scripts/structure-audit/rules/imports.mjs`:

```js
// current
if (testRoots.has(path.posix.basename(importerDir)) && targetDir === path.posix.dirname(importerDir)) continue;

// proposed: a module under <dir>/<child>/ importing <dir>'s own modules is
// not a consumer crossing a boundary. Covers tests/ and the kind folders.
if (targetDir === path.posix.dirname(importerDir)) continue;
```

The `tests/` rule is already a special case of this; dropping the name check
generalizes it without widening it anywhere else. It stays precise: a component
at `flow-editor/components/X.tsx` importing `../../graph/ports` has
`dirname(importerDir) === flow-editor`, not `automation-studio/graph`, so
crossing into another feature is still counted. I did not make this change —
`scripts/` is a shared control and five workers are running against it.

**This is not only my problem.** `live/` and `hierarchy/` are performing the
same kind split right now and will produce the same manufactured violations at
similar scale. Phase 4 cannot land in any of the three directories until this
is settled, so it is worth settling once, now, rather than three times.

## Commands run and observed results

1. **Barrel surface.** Extracted HEAD's `flow-editor/` with `git archive`,
   resolved both `index.ts` files recursively through `export ... from` and
   `export *`: `before: 51 names / after: 51 names`, `diff` empty —
   **barrel surface identical**.

2. **`pnpm exec tsc --noEmit`** (apps/web) → 2 errors, **0 in my scope**:
   `live/AutomationStudioComposition` (the `live/` worker) and
   `programs/ProgramLiveViews.tsx` (the `core-shared-ui` worker). Both
   confirmed against `git status` as in-flight renames by those workers.
   Filtered count for `flow-editor|views|graph|stores|automation-studio/tests`
   = **0**.

3. **`pnpm exec vitest run src/features/automation-studio/flow-editor`**
   → `Test Files 10 passed (10)`, `Tests 43 passed (43)`.
   **Identical to the before-state** I recorded on the untouched tree.

4. **The six dependent external test files** → 8 failures. Seven are
   attributable to other workers, by ENOENT on paths in directories they own:
   `hierarchy/useAutomationHierarchyWorkspaceState.ts`,
   `live/useAutomationGraphRuntime.ts`,
   `live/AutomationStudioWorkspaceComposition.tsx`,
   `live/AutomationStudioSession.tsx` (×2), plus two assertions naming
   `live/hooks/useAutomationBrowserEntry.ts` and `hierarchy/ProjectTree.tsx`.
   **No ENOENT names a `flow-editor` path** — the discriminator the
   coordinator specified.

5. **The eighth failure is the known pre-existing one, and I root-caused it.**
   `GraphEditorViews.test.ts > Flow editor decomposition contracts > keeps
   active-tab changes behind the Flow editor render boundary` still fails with
   a **content assertion**, not a read error — the required bar. The cause is
   unrelated to any move:

   ```
   preloader source:  [automationStudioViewId.flowEditor]: () => import(...)
   test expectation:  '"flow-nodes": () => import(...)'
   ```

   The preloader was refactored from a literal `"flow-nodes"` key to the
   `automationStudioViewId` registry constant and the string-matching test was
   never updated, so the **key** half has never matched. I repointed the path
   half on both sides so they stay consistent
   (`.../flow-editor/components/FlowGraphCanvas`), as instructed. I did **not**
   touch the key half: that would change what the test asserts about product
   behaviour, which is outside "repoint path literals and imports only". This
   is one of the five `apps/web` failures listed in `Current State`, now
   diagnosed to one word.

6. **`node scripts/structure-audit.mjs --json`**, diffed against the
   before-snapshot:
   - `imports` for `flow-editor`: **0 → 16 failures** (the blocking finding).
   - `directory-files` for `flow-editor`: **no finding at all** — it was a
     baselined 36, it is now 13, so it drops out entirely. The baseline entry
     can be removed on regeneration.
   - `exported-values` `NodePortList.tsx::components = 3` — a pure key
     relocation, same value at the new path.
   - `file-lines` `useFlowEditorCanvasInteractions.ts = 575` — same warning,
     relocated key. Warnings do not ratchet.
   - `canonical-view-functionality.test.ts` — **still exactly 10**, unchanged,
     as predicted: neither end of those eleven sibling specifiers moved.
   - **Failures in my 8 external files: before 0 → after 0.**

7. **Stale-reference sweep** over every tracked file for string literals naming
   a moved file at its old path: **clean**. Residual hits are 4 keys in
   `.structure-baseline.json` (not mine to edit; regeneration relocates them)
   and one line of prose in `core-web-studio-b.md`.

I did not run `pnpm structure:baseline`.

## Path literals — sizing the problem before Phases 6 and 7

Requested census. I scanned every tracked `.ts`/`.tsx`/`.mjs` file that uses
`readFileSync`, `new URL` or `existsSync` for relative string literals naming a
source file, and resolved each against its importer.

**376 path literals, in 73 files, pointing into 69 distinct directories.**

These are invisible to `tsc` and to the `imports` rule. They fail at run time,
as ENOENT, and only if the test actually runs. Every one is a file that must be
edited when its target moves — by whoever owns the *literal*, who is usually
not whoever owns the *file being moved*.

Target directories most exposed (a move here breaks something elsewhere):

| Refs | Directory |
| --- | --- |
| 38 | `automation-studio/flow-editor/components` (mine, now repointed) |
| 31 | `automation-studio/workspace/shell` |
| 30 | `automation-studio/flow-editor/hooks` (mine, now repointed) |
| 24 | `automation-studio/views` |
| 12 each | `apps/web/src/app`, `automation-studio/live`, `automation-studio/styles/workspace`, `automation-studio/recordings`, `programs/live-views` |
| 10 each | `automation-studio/live/hooks`, `automation-studio/flow-editor`, `automation-studio` (root), `automation-studio/hierarchy`, `automation-studio/live/view-host` |
| 9 | `automation-studio/clients` |
| 6 each | `hierarchy/components`, `live/components`, `workspace/commands`, `automation-studio/runtime`, `automation-studio/settings`, `app/styles/global-programs` |

Files holding the most literals (who has to be edited):

| Refs | File |
| --- | --- |
| 74 | `views/tests/GraphEditorViews.test.ts` |
| 41 | `live/tests/automation-studio-live-ownership.test.ts` |
| 17 | `testing/tests/phase11-shell-connector-source-contract.test.ts` |
| 17 | `views/tests/canonical-diagnostics-disclosure.test.ts` |
| 16 | `workspace/tests/components.test.tsx` |
| 15 | `workspace/tests/strict-runtime-contract.test.ts` |
| 12 | `programs/tests/phase7-responsive-contract.test.ts` |
| 9 each | `flow-editor/tests/communication-boundary.test.ts`, `graph/tests/useAutomationGraphController.test.ts`, `hierarchy/components/tests/ProjectTree.test.tsx`, `router/tests/router-view.test.tsx` |
| 8 each | `stores/tests/domain-state-ownership.test.ts`, `views/tests/TimelineView.test.ts`, `packages/fluxiq/src/framework/index.ts` |

**Three observations for sizing.**

- `workspace/shell` (31) is the next big exposure after the three Phase 4
  features, and `workspace/tests/` holds 31 literals of its own — a
  `workspace/` reorganization is a bigger version of what I just did.
- **Ownership does not partition.** `views/tests/GraphEditorViews.test.ts` (74)
  and `live/tests/automation-studio-live-ownership.test.ts` (41) each point
  into many features at once, so any phase that moves files in several features
  makes those two files contended. A dispatch that partitions by file cannot
  give them to two workers. Either one worker owns the literal-holding file for
  the whole phase, or the phase is serial in it.
- `packages/fluxiq/src/framework/index.ts` holding 8 such literals is worth a
  separate look — a shipped barrel reading source paths off disk is a different
  kind of problem from a test doing it.

**The durable fix** is to stop asserting on paths. Either route these
assertions through barrels, or — cheaper and mechanical — give each test file
one shared manifest of the paths it inspects, so a move edits one constant
instead of many literals. Applied to `GraphEditorViews.test.ts` alone that
turns 54 edits into about 6.

## Not verified

- **`pnpm check` as a whole**, and therefore whether anything outside my scope
  regresses. It cannot pass right now regardless — the 16 `imports` findings
  block it, and `live/`, `hierarchy/`, `programs/` and the stylesheets are all
  mid-move in the same tree.
- **The final state of the `live/` and `hierarchy/` couplings.** I repointed
  `communication-boundary.test.ts` at `live/hooks/useAutomationGraphRuntime.ts`
  against the `live/` worker's *current staged* tree. If they move it again,
  that line breaks again. Re-verify at integration.
- **`tests/architecture-contract.test.ts` beyond my 7 repointed literals.** It
  is in my grant, but four of its cases now fail on `live/` and `hierarchy/`
  paths, including an exemption list keyed by
  `live/hooks/useAutomationBrowserEntry.ts`. Those workers cannot edit this
  file and I was told to change nothing in it but path literals for *my* move.
  **Someone must own reconciling it after all three Phase 4 splits land.**
- **Browser behaviour.** The lazy/code-split contract around `FlowEditorView`,
  `FlowGraphCanvas` and `view-surface-preloader` is asserted only by string
  matching, and that assertion is the one that is already broken. I preserved
  the specifier shapes deliberately, but nothing I ran proves the split points
  still behave correctly in a real browser.
- **`vitest.quality.config.ts`** — still untouched and unopened, per the brief.
  Worth a confirmation that none of its named paths pointed into `flow-editor/`.

## Open questions or contradictions found

1. **Phase 4's kind rule and the frozen `imports` rule are in direct conflict,
   for all three features at once.** The recommended one-line generalization is
   above. Until it lands, none of `flow-editor/`, `live/` or `hierarchy/` can
   pass `pnpm check`, and the two workarounds available to a worker are the two
   this plan already rejected in Phase 1.

2. **The `GraphEditorViews` pre-existing failure is now diagnosed** — the
   preloader uses a computed `[automationStudioViewId.flowEditor]` key while
   the test asserts a literal `"flow-nodes"` key. It is a one-line fix in a
   file I was told not to change beyond path literals. Fixing it would take one
   of the five known `apps/web` failures off the board and restore the
   "unchanged failure list" bar to something meaningful for the next worker who
   has to touch that file.

3. **Path-literal architecture tests are the plan's main structural obstacle,
   and they do not respect file-partitioned ownership.** 376 literals, 73
   files, 69 target directories. Two files alone hold 115 of them and point
   into many features each. Sizing and the recommended fix are in the section
   above; the scheduling consequence is that Phases 6 and 7 need an explicit
   owner for the literal-holding files, decided before dispatch rather than
   discovered by the first worker to trip over them.

4. **`maxPathSegments` is 8 and the kind split lands exactly on 8.** Any
   further nesting under `features/` — a kind folder inside a kind folder, or
   one more feature level — trips a rule that is `ratchet: false` and therefore
   cannot be baselined away. Worth recording before a later phase plans deeper
   structure.

5. **Minor, for the record:** `canonical-view-functionality.test.ts` imports
   from eleven sibling view directories, not ten; the baselined 10 reflects a
   rule exemption on one of them. It stayed at 10 through this move, as
   predicted.
