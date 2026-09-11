# Worker report: core-api-contracts

Brief: `### Brief: core-api-contracts`, Phase 4 / 5 / 8 dispatch, 2026-09-10.
Repository: FluxIQ Core (`F:\!FluxIQ`). Date: 2026-09-10.

## Outcome

**Partial.** The Phase 5 split of
`packages/fluxiq/src/programs/automation-studio/api/contracts.ts` is complete
and verified: 977 lines became a 16-module `api/contracts/` directory behind an
`index.ts`, the exported name set is byte-identical, and **zero importers
changed**. One definition-of-done bullet is not met and was not in the task:
`api/handlers.ts` is still over 800 lines (see *Contradictions*, below).

**The brief's stated premise is false, and the work had to be done differently
because of it.** The brief says consumers "import the specifier
`.../api/contracts`, [so] a directory with an `index.ts` resolves identically
and no importer should change". They do not. This repository writes explicit
`.ts` extensions in every relative specifier (`allowImportingTsExtensions`,
`moduleResolution: "Bundler"`), so every importer writes `../api/contracts.ts`
— a file path, which a directory does not satisfy. Proof is quoted below. The
brief's *requirement* (zero importers change) is still met, by keeping
`api/contracts.ts` as a one-line re-export of `./contracts/index.ts`.

## What changed and why

`api/contracts.ts` (977 lines, 117 exported names) became:

| File | Lines | Declarations | Domain noun |
| --- | --- | --- | --- |
| `contracts/endpoints.ts` | 168 | 3 | endpoint map, normal-editor write endpoint, its assertion |
| `contracts/project.ts` | 46 | 4 | project, category, studio snapshot, problem |
| `contracts/hierarchy.ts` | 47 | 5 | project hierarchy nodes and child pages |
| `contracts/ui-cache.ts` | 62 | 11 | project UI cache entries and stats |
| `contracts/change-feed.ts` | 44 | 6 | project change feed |
| `contracts/llm.ts` | 45 | 11 | reusable LLM context + LLM execution grants |
| `contracts/flow.ts` | 52 | 8 | flow identity, create/save/publish |
| `contracts/graph.ts` | 30 | 6 | graph viewport, patch, revisions, snapshots |
| `contracts/subflow.ts` | 41 | 6 | subflow lifecycle |
| `contracts/flow-map.ts` | 52 | 7 | flow map routes, groups, fallback |
| `contracts/instruction.ts` | 33 | 5 | flow instruction set |
| `contracts/adaptation.ts` | 164 | 11 | bootstrap generation readiness + adaptations |
| `contracts/run.ts` | 25 | 4 | flow run pages, runtime session control |
| `contracts/recording.ts` | 114 | 22 | recording lifecycle, state, normalization |
| `contracts/policy.ts` | 39 | 6 | policy generation, learning, replay |
| `contracts/client.ts` | 30 | 5 | client gateway session requests |
| `contracts/index.ts` | 16 | — | barrel, `export *` from all 16 |
| `contracts.ts` | 1 | — | `export * from "./contracts/index.ts";` |

Largest new file is 168 lines, under the 400-line advisory. Declaration bodies
were moved verbatim — no exported symbol was renamed, no declaration edited.
Cross-group references became same-directory `import type` lines (exempt from
the `imports` rule); no group needs a *value* import from another group, so the
`export *` chain has no runtime cycle.

Two deliberate decisions beyond the mechanical move:

1. **`api/contracts.ts` survives as a one-line shim.** Without it, ten import
   sites across seven files break, four of them in `storage/` and `runtime/`,
   which my brief forbids me to touch and which two other workers are editing
   right now. The shim is what makes "zero importers changed" true.
2. **One import was repointed to a barrel.** `contracts.ts` imported three
   types from `../storage/project-reusable-llm-context-store.ts`, reaching past
   `storage/`'s barrel. `storage/index.ts` already re-exports that module
   (line 52), so `contracts/llm.ts` imports `../../storage/index.ts` instead.
   This follows the Phase 2/3 shared context ("repoint them at the barrel if it
   already exports the symbol"), removes a barrel-skipping import, and — more
   urgently — survives core-storage-split renaming that file (see
   *Cross-worker findings*). No barrel was widened.

Every other import kept its original target, rewritten one directory deeper
(`../types.ts` → `../../types.ts`, and so on).

## Commands run and observed results

**1. Exported name set, before vs after.** Captured with the TypeScript
checker (`getExportsOfModule`), which sees types as well as values:

```text
before: api/contracts.ts :: 117      after: api/contracts.ts :: 117
before: api/index.ts     :: 120      after: api/index.ts     :: 120

$ diff <before names> <after names>
(no output)  -> IDENTICAL (117 names)
$ diff <before barrel names> <after barrel names>
(no output)  -> IDENTICAL (120 names)
```

The diff is empty in both directions: the 117-name `contracts` surface and the
120-name `api` barrel surface are unchanged, name for name.

**2. Zero importers changed.**

```text
$ git diff --cached -- .../api/index.ts .../api/handlers.ts .../api/tests/
(no output)
```

`api/index.ts` still reads `export * from "./contracts.ts";`, byte for byte.
The staged diffstat is 18 files: `contracts.ts` rewritten to one line, 17 files
added. No file outside `api/` was touched by me.

**3. The brief's resolution premise, disproved.** I parked the shim and
type-checked:

```text
$ mv api/contracts.ts <elsewhere> && tsc --noEmit -p packages/fluxiq/tsconfig.json
34 errors, including:
  api/handlers.ts(86,8): TS2307: Cannot find module './contracts.ts' ...
  api/index.ts(1,15): TS2307: Cannot find module './contracts.ts' ...
  api/tests/handlers.test.ts(11,258): TS2307: Cannot find module '../contracts.ts' ...
  runtime/service.ts(7,222): TS2307: Cannot find module '../api/contracts.ts' ...
  runtime/service.ts(591,20): TS2307: Cannot find module '../api/contracts.ts' ...
  runtime/service.ts(10831,53): TS2307: Cannot find module '../api/contracts.ts' ...
  runtime/tests/reusable-llm-context-service.test.ts(5,45): TS2307: ...
  runtime/tests/service-flow-bootstrap-adaptation.test.ts(6,45): TS2307: ...
  storage/catalog-index-migration.ts(3,79): TS2307: ...
  storage/catalog.ts(3,79): TS2307: ...
  storage/file-store.ts(3,46): TS2307: ...
  storage/project-hierarchy-repository.ts(2,86): TS2307: ...
```

`contracts/index.ts` existed throughout. A directory does **not** satisfy
`"./contracts.ts"`. The shim was restored immediately and the run repeated.

**4. Type check.**

```text
$ tsc --noEmit -p packages/fluxiq/tsconfig.json
TSC_EXIT=0          (clean, package-wide, run last at 18:51)
```

Isolated to my own closure (TS program rooted at `contracts.ts` +
`contracts/index.ts`, 208 files):

```text
diagnostics inside automation-studio/api/: 0
diagnostics elsewhere: 0
```

**5. Runtime export chain.** Type-level identity does not prove the `export *`
chain still carries values, so I transpiled the split modules to ESM outside
the repository and imported the shim:

```text
runtime value exports through the shim: 5
  AUTOMATION_STUDIO_ENDPOINTS
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS
  AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT
  assertAutomationStudioNormalEditorGraphEndpoint
  parseAutomationStudioFlowBootstrapGenerationReadiness
AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch = apply-graph-patch
AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT = apply-graph-patch
endpoint key count = 158
parse(readiness const) round-trips = true
parse(garbage) rejects = true
assert rejects saveFlow = true
```

All 158 endpoint keys and all five values survive, and both functions behave.

**6. Tests, scoped.**

```text
$ vitest run src/programs/automation-studio/api/tests/handlers.test.ts
 Test Files  1 passed (1)
      Tests  34 passed (34)
```

The test file is byte-identical to `HEAD` (`git diff` on `api/tests/` is
empty), so 34/34 is both the before and the after count. Its first run failed
to collect with `Failed to load url ./llm-harness.ts ... in runtime/service.ts`
— the collection failure the dispatch warned about, caused by core-runtime-split
having moved `runtime/llm-*.ts` but not yet repointed `service.ts`. It passed on
retry once that worker's edits landed.

I also ran the two external importers that reach `../../api/contracts.ts`, as
direct evidence that the old specifier still resolves at runtime:

```text
$ vitest run runtime/tests/reusable-llm-context-service.test.ts \
             runtime/tests/service-flow-bootstrap-adaptation.test.ts
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

**7. Structure audit** (`node scripts/structure-audit.mjs --json`, new files
staged with `git add` so `git ls-files` sees them):

| Rule | Key | Before | After |
| --- | --- | --- | --- |
| `file-lines` | `api/contracts.ts` | 977 | 1 |
| `file-lines` | any file in `api/contracts/` | — | max 168 (no finding) |
| `imports` | `api/contracts.ts` | 2 | 0 |
| `imports` | `api/contracts/project.ts` | — | 1 (new key) |
| `imports` | `api/contracts/policy.ts` | — | 1 (new key) |
| `directory-files` | `api/contracts` | — | 17 (advisory warn; fail limit 25) |

"Before" values are the frozen `.structure-baseline.json` entries (lines 101–165).

Three consequences worth the supervisor's attention:

- **Two new `imports` keys, same total count.** Both are the single
  `import type { ... } from "../../types.ts"` that the original file already
  made; it now appears in the two files that need those types. Net repository
  count for this contract module is unchanged at 2. They are *new keys*, so the
  ratchet refuses them until the baseline is regenerated. The only way to
  remove them is to import `automation-studio/index.ts` — a child importing its
  own ancestor barrel — which I judged worse than the finding.
- **Four entries became lowerable because of this split.** The `imports` rule
  exempts a target that resolves to a tracked directory
  (`if (directories.has(target)) continue;`). `../api/contracts.ts` now strips
  to `.../api/contracts`, which *is* a directory, so importers stop counting it
  as a barrel skip: `runtime/service.ts`, both runtime tests above, and
  `storage/file-store.ts` all show as lowerable. I could not fully isolate this
  from the concurrent runtime and storage edits, but the mechanism is in the
  rule source.
- **One advisory warning is new and deliberate.** `api/contracts/` holds 17
  source files, past the 15-file advisory, under the 25-file fail limit. Going
  lower means merging cohesive nouns back together, and subdirectories are not
  available: `api/contracts/<group>/<file>.ts` is 9 path segments against a
  `maxPathSegments` of 8, which is a non-ratcheting hard failure. 17 flat,
  cohesive files is the best available shape.

I did **not** run `pnpm structure:baseline`, `pnpm check`, `pnpm test`, or
`pnpm build`.

## Contradictions found

**The definition of done demands more than the task.** Task: split
`contracts.ts`. Definition of done: "no file in `api/` over 800 lines".
`api/handlers.ts` was 2,094 lines before I started, is frozen in the baseline
at that value, and splitting it is a different job: it is executable handler
code (Phase 6, "Giant function bodies"), not a declaration dump, it carries an
1,135-line test, and core-runtime-split is editing it right now. I did not
split it, which is why this report says Partial. If the supervisor wants it,
it should be its own brief, dispatched when no other worker is in that file.

**The brief's resolution premise is wrong** — restated here because it will
recur in any similar split in this repository: specifiers carry `.ts`, so a
`foo.ts` → `foo/` split *always* needs either a shim or every importer
repointed. There is no "resolves identically" path.

## Cross-worker findings

- **core-storage-split's brief contains a factual error.** It states "Nothing
  outside `storage/` imports its internals today (verified: zero barrel-skipping
  importers)". `api/contracts.ts` imported
  `../storage/project-reusable-llm-context-store.ts` — an external
  barrel-skipping import of a `project-` file that brief moves to
  `storage/project/reusable-llm-context-store.ts`. Had I left it, that rename
  would have broken this package. Repointing to `../../storage/index.ts`
  removed the hazard from my side. The supervisor should check whether other
  "verified zero" claims in that brief hold.
- **`api/handlers.ts` is owned by two briefs at once.** Mine says "Owns:
  `api/**`"; core-runtime-split's says "plus the four external importers you
  identify", and `api/handlers.ts` is one of them. That worker has rewritten its
  runtime imports (working tree, unstaged). Their change is correct and I left
  it alone, so there is no conflict in the tree — but the partition was not
  actually disjoint, contrary to the dispatch's claim that "every brief below
  owns a disjoint set of files".
- **That edit turned `handlers.ts` into a ratchet failure.** It replaced four
  import lines with seven, taking the file from 2,094 to 2,097 lines. The
  baseline freezes it at 2,094 and rewrites downward with `min(previous,
  current)`, so 2,097 fails and will keep failing:
  `[file-lines] api/handlers.ts = 2097 (limit 800)`. Collapsing that import
  block back to one or four lines clears it. I did not touch the file because
  another worker is in it.

## Not verified

- `pnpm check`, `pnpm test`, `pnpm build`, and the full `packages/fluxiq` test
  suite. Scope was restricted per the dispatch; other workers were rebuilding
  concurrently.
- Anything consuming `packages/fluxiq/dist`. `apps/web` resolves this package
  through built declarations, and I did not rebuild `dist` — a rebuild mid-flight
  is exactly what the dispatch warned produces spurious failures elsewhere. The
  supervisor's integration build will regenerate it; the package `exports` map
  has no subpath naming `api/contracts`, so no export entry needs changing.
- The four pre-existing `packages/fluxiq` test failures named in `Current
  State`. None of the tests I ran is among them, so I neither confirmed nor
  cleared them.
- Live browser behaviour. Not applicable to a type-declaration split.

## Open questions

1. Does the supervisor want `api/handlers.ts` split, and under which brief?
   Until it is, the `api/` definition-of-done bullet cannot be satisfied by
   anyone.
2. Who fixes `handlers.ts` back to ≤2,094 lines — me, core-runtime-split, or
   the supervisor at integration?
3. `api/contracts/` sits at 17 files against a 15-file advisory, with
   subdirectories blocked by the 8-segment depth limit. Accept the warning, or
   raise `maxPathSegments` so deep contract groups become possible?

## Files changed

Staged (`git add`), not committed:

```text
M  packages/fluxiq/src/programs/automation-studio/api/contracts.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/index.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts
A  packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts
```

Staging was needed because the audit enumerates with `git ls-files`; untracked
files are invisible to it, and the first audit run reported nothing for this
directory. No commit was made. `git mv` does not apply to a one-to-many
declaration split: there is no single successor file, and the largest group
(`endpoints.ts`, 168 lines) is 17% of the original. Git will attribute by
content similarity at commit time.
